import { Request } from 'express';
import { AdminRole } from 'bizpark.core';

export type AdminSessionUser = {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
};

export type AdminRequest = Request & {
  adminUser?: AdminSessionUser;
};
