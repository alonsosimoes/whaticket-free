import { verify } from "jsonwebtoken";
import { Response as Res } from "express";

import User from "../../models/User";
import AppError from "../../errors/AppError";
import ShowUserService from "../UserServices/ShowUserService";
import authConfig from "../../config/auth";
import {
  createAccessToken,
  createRefreshToken
} from "../../helpers/CreateTokens";

interface RefreshTokenPayload {
  id: string;
  tokenVersion: number;
}

interface Response {
  user: User;
  newToken: string;
  refreshToken: string;
}

export const RefreshTokenService = async (
  res: Res,
  token: string
): Promise<Response> => {
  if (!token) {
    res.clearCookie("jrt"); // Certifique-se de limpar o cookie
    throw new AppError("Refresh token não fornecido", 401);
  }

  try {
    // Decodifica e verifica o token usando o segredo configurado
    const decoded = verify(token, authConfig.refreshSecret) as RefreshTokenPayload;

    const { id, tokenVersion } = decoded;

    // Recupera o usuário pelo ID
    const user = await ShowUserService(id);

    // Verifica se a versão do token no banco de dados é válida
    if (user.tokenVersion !== tokenVersion) {
      res.clearCookie("jrt");
      throw new AppError("Sessão expirada, autenticação necessária", 401);
    }

    // Gera novos tokens
    const newToken = createAccessToken(user);
    const refreshToken = createRefreshToken(user);

    return { user, newToken, refreshToken };
  } catch (err) {
    res.clearCookie("jrt");
    throw new AppError("Sessão expirada ou token inválido", 401);
  }
};
