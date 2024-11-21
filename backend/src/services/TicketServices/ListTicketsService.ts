import { endOfDay, parseISO, startOfDay } from "date-fns";
import { intersection } from "lodash";
import { col, Filterable, fn, Includeable, Op, where } from "sequelize";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import Tag from "../../models/Tag";
import Ticket from "../../models/Ticket";
import TicketTag from "../../models/TicketTag";
import Whatsapp from "../../models/Whatsapp";
import ShowUserService from "../UserServices/ShowUserService";

interface Request {
  searchParam?: string;
  pageNumber?: string;
  status?: string;
  date?: string;
  updatedAt?: string;
  showAll?: string;
  userId: string;
  withUnreadMessages?: string;
  queueIds: number[];
  tags: number[];
}

interface Response {
  tickets: Ticket[];
  count: number;
  hasMore: boolean;
}

// Controle global para abortar requisições
let currentAbortController: AbortController | null = null;

// Função principal do serviço
const ListTicketsService = async (params: Request): Promise<Response> => {
  // Aborta a requisição anterior, se existir
  if (currentAbortController) {
    currentAbortController.abort();
  }

  // Cria um novo controlador para a requisição atual
  currentAbortController = new AbortController();

  try {
    const result = await ListTicketsServiceInternal(params, currentAbortController.signal);
    return result;
  } catch (error) {
    if (error.name === "AbortError") {
      console.log("Requisição cancelada.");
      return { tickets: [], count: 0, hasMore: false };
    }
    throw error; // Outros erros são lançados
  } finally {
    currentAbortController = null; // Limpa o controlador após a requisição
  }
};

// Função interna que realiza a consulta
const ListTicketsServiceInternal = async (
  {
    searchParam = "",
    pageNumber = "1",
    queueIds,
    tags,
    status,
    date,
    updatedAt,
    showAll,
    userId,
    withUnreadMessages
  }: Request,
  signal?: AbortSignal // Recebe o AbortSignal
): Promise<Response> => {
  // Verifica se a requisição foi cancelada antes de começar
  if (signal?.aborted) {
    throw new Error("Requisição cancelada");
  }

  let whereCondition: Filterable["where"] = {
    [Op.or]: [{ userId }, { status: "pending" }],
    queueId: { [Op.or]: [queueIds, null] }
  };

  let includeCondition: Includeable[] = [
    {
      model: Contact,
      as: "contact",
      attributes: ["id", "name", "number", "profilePicUrl"]
    },
    {
      model: Queue,
      as: "queue",
      attributes: ["id", "name", "color"]
    },
    {
      model: Whatsapp,
      as: "whatsapp",
      attributes: ["name"]
    },
    {
      model: Tag,
      as: "tags",
      attributes: ["id", "name", "color"]
    }
  ];

  if (showAll === "true") {
    whereCondition = { queueId: { [Op.or]: [queueIds, null] } };
  }

  if (status) {
    whereCondition = {
      ...whereCondition,
      status
    };
  }

  if (searchParam) {
    const sanitizedSearchParam = searchParam.toLowerCase().trim();

    includeCondition.push({
      model: Message,
      as: "messages",
      attributes: ["id", "body"],
      where: {
        body: where(fn("LOWER", col("body")), "LIKE", `%${sanitizedSearchParam}%`)
      },
      required: false,
      duplicating: false
    });

    whereCondition = {
      ...whereCondition,
      [Op.or]: [
        { "$contact.name$": where(fn("LOWER", col("contact.name")), "LIKE", `%${sanitizedSearchParam}%`) },
        { "$contact.number$": { [Op.like]: `%${sanitizedSearchParam}%` } },
        {
          "$message.body$": where(
            fn("LOWER", col("body")),
            "LIKE",
            `%${sanitizedSearchParam}%`
          )
        }
      ]
    };
  }

  if (date) {
    whereCondition = {
      ...whereCondition,
      createdAt: {
        [Op.between]: [+startOfDay(parseISO(date)), +endOfDay(parseISO(date))]
      }
    };
  }

  if (updatedAt) {
    whereCondition = {
      ...whereCondition,
      updatedAt: {
        [Op.between]: [+startOfDay(parseISO(updatedAt)), +endOfDay(parseISO(updatedAt))]
      }
    };
  }

  if (withUnreadMessages === "true") {
    const user = await ShowUserService(userId);
    const userQueueIds = user.queues.map(queue => queue.id);

    whereCondition = {
      [Op.or]: [{ userId }, { status: "pending" }],
      queueId: { [Op.or]: [userQueueIds, null] },
      unreadMessages: { [Op.gt]: 0 }
    };
  }

  if (Array.isArray(tags) && tags.length > 0) {
    const ticketTags = await TicketTag.findAll({
      where: { tagId: { [Op.in]: tags } },
      attributes: ["ticketId"]
    });

    const ticketsIntersection = intersection(ticketTags.map(tag => tag.ticketId));

    whereCondition = {
      ...whereCondition,
      id: { [Op.in]: ticketsIntersection }
    };
  }

  const limit = 40;
  const offset = limit * (+pageNumber - 1);

  const { count, rows: tickets } = await Ticket.findAndCountAll({
    where: whereCondition,
    include: includeCondition,
    distinct: true,
    limit,
    offset,
    order: [["updatedAt", "DESC"]],
    subQuery: false
  });

  const hasMore = count > offset + tickets.length;

  return {
    tickets,
    count,
    hasMore
  };
};

export default ListTicketsService;
