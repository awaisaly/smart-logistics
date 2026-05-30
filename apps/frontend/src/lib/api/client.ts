import axios from "axios";
import { API_BASE } from "../api";

export const apiClient = axios.create({
  baseURL: API_BASE,
  withCredentials: true
});
