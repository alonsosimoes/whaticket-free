import React, { useState, useEffect, useReducer, useContext } from "react";
import openSocket from "../../services/socket-io";

import { makeStyles } from "@material-ui/core/styles";
import List from "@material-ui/core/List";
import Paper from "@material-ui/core/Paper";

import TicketListItem from "../TicketListItem";
import TicketsListSkeleton from "../TicketsListSkeleton";

import useTickets from "../../hooks/useTickets";
import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";

const useStyles = makeStyles((theme) => ({
  ticketsListWrapper: {
    position: "relative",
    display: "flex",
    height: "100%",
    flexDirection: "column",
    overflow: "hidden",
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  ticketsList: {
    flex: 1,
    overflowY: "scroll",
    ...theme.scrollbarStyles,
    borderTop: "2px solid rgba(0, 0, 0, 0.12)",
  },
  noTicketsDiv: {
    display: "flex",
    height: "100px",
    margin: 40,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  noTicketsText: {
    textAlign: "center",
    color: "rgb(104, 121, 146)",
    fontSize: "14px",
    lineHeight: "1.4",
  },
  noTicketsTitle: {
    textAlign: "center",
    fontSize: "16px",
    fontWeight: "600",
    margin: "0px",
  },
}));

const reducer = (state, action) => {
  switch (action.type) {
    case "LOAD_TICKETS": {
      const newTickets = action.payload;
      const updatedState = [...state];

      newTickets.forEach((ticket) => {
        const index = updatedState.findIndex((t) => t.id === ticket.id);
        if (index !== -1) {
          updatedState[index] = ticket;
          if (ticket.unreadMessages > 0) {
            updatedState.unshift(updatedState.splice(index, 1)[0]);
          }
        } else {
          updatedState.push(ticket);
        }
      });

      return updatedState;
    }
    case "RESET": {
      return [];
    }
    default:
      return state;
  }
};

const TicketsList = ({
  status,
  searchParam,
  showAll,
  selectedQueueIds,
  updateCount,
  style,
  tags,
}) => {
  const classes = useStyles();
  const [pageNumber, setPageNumber] = useState(1);
  const [ticketsList, dispatch] = useReducer(reducer, []);
  const { user } = useContext(AuthContext);
  const { profile, queues } = user;

  const { tickets, hasMore, loading } = useTickets({
    pageNumber,
    searchParam,
    status,
    showAll,
    tags: JSON.stringify(tags),
    queueIds: JSON.stringify(selectedQueueIds),
  });

  // Atualiza os tickets ao receber novos dados
  useEffect(() => {
    const queueIds = queues.map((q) => q.id);
    const filteredTickets = tickets.filter(
      (t) => queueIds.includes(t.queueId) || t.queueId === null
    );

    const payload = profile === "user" ? filteredTickets : tickets;
    dispatch({ type: "LOAD_TICKETS", payload });
  }, [tickets, queues, profile]);

  // Redefine a lista ao mudar filtros
  useEffect(() => {
    dispatch({ type: "RESET" });
    setPageNumber(1);
  }, [status, searchParam, showAll, selectedQueueIds, tags]);

  // Sincronização do contador
  useEffect(() => {
    if (typeof updateCount === "function") {
      updateCount(ticketsList.length);
    }
  }, [ticketsList, updateCount]);

  // Gerenciamento do socket para atualizações em tempo real
  useEffect(() => {
    const socket = openSocket();

    const shouldUpdateTicket = (ticket) =>
      (!ticket.userId || ticket.userId === user?.id || showAll) &&
      (!ticket.queueId || selectedQueueIds.includes(ticket.queueId));

    socket.on("ready", () => {
      socket.emit("joinTickets", status || "general");
    });

    socket.on("ticket", (data) => {
      if (data.action === "update" && shouldUpdateTicket(data.ticket)) {
        dispatch({ type: "LOAD_TICKETS", payload: [data.ticket] });
      }

      if (data.action === "delete") {
        dispatch({ type: "RESET" }); // Remove o ticket excluído
      }
    });

    return () => socket.disconnect();
  }, [status, showAll, user, selectedQueueIds]);

  // Carregar mais ao rolar
  const handleScroll = (e) => {
    if (loading || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      setPageNumber((prev) => prev + 1);
    }
  };

  return (
    <Paper className={classes.ticketsListWrapper} style={style}>
      <Paper
        square
        elevation={0}
        className={classes.ticketsList}
        onScroll={handleScroll}
      >
        <List>
          {ticketsList.length === 0 && !loading && (
            <div className={classes.noTicketsDiv}>
              <p className={classes.noTicketsTitle}>
                {i18n.t("ticketsList.noTicketsTitle")}
              </p>
              <p className={classes.noTicketsText}>
                {i18n.t("ticketsList.noTicketsMessage")}
              </p>
            </div>
          )}

          {ticketsList.map((ticket) => (
            <TicketListItem ticket={ticket} key={ticket.id} />
          ))}

          {loading && <TicketsListSkeleton />}
        </List>
      </Paper>
    </Paper>
  );
};

export default TicketsList;
