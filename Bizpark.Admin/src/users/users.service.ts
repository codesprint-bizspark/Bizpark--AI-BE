import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { applicationDb } from 'bizpark.core';
import { AuditService } from '../common/audit.service';

type UserRow = Awaited<ReturnType<typeof applicationDb.user.findMany>>[number];

export type UserListQuery = {
  search?: string;
  email?: string;
  status?: string;
  businessCount?: string;
  registered?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
  businessId?: string;
};

@Injectable()
export class UsersService {
  constructor(private readonly audit: AuditService) {}

  async list(query: UserListQuery = {}) {
    const users = this.dedupe(await applicationDb.user.findMany({ orderBy: { createdAt: 'desc' } })).map((user) => ({
      ...user,
      name: this.formatName(user.name),
    }));
    const filtered = this.filterUsers(users, query);
    const sorted = this.sortUsers(filtered, query.sort);
    const pageSize = this.toPositiveNumber(query.pageSize, 10);
    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const page = Math.min(this.toPositiveNumber(query.page, 1), totalPages);

    return {
      users: sorted.slice((page - 1) * pageSize, page * pageSize),
      filters: {
        search: query.search ?? '',
        email: query.email ?? '',
        status: query.status ?? '',
        businessCount: query.businessCount ?? '',
        registered: query.registered ?? '',
        sort: query.sort ?? 'newest',
        page,
        pageSize,
        businessId: query.businessId ?? '',
      },
      pagination: {
        page,
        pageSize,
        total: sorted.length,
        totalPages,
        hasPrevious: page > 1,
        hasNext: page < totalPages,
      },
      stats: {
        total: users.length,
        active: users.filter((user) => user.isActive).length,
        suspended: users.filter((user) => !user.isActive).length,
        withoutBusinesses: users.filter((user) => (user.businesses?.length ?? 0) === 0).length,
        multiBusiness: users.filter((user) => (user.businesses?.length ?? 0) > 1).length,
      },
    };
  }

  async create(input: { name?: string; email?: string; password?: string }, adminId?: string) {
    const email = input.email?.trim().toLowerCase();
    if (!email) {
      throw new NotFoundException('Email is required');
    }
    const user = await applicationDb.user.create({
      data: {
        name: this.formatName(input.name || email.split('@')[0]),
        email,
        passwordHash: await bcrypt.hash(input.password || this.defaultTemporaryPassword(), 10),
      },
    });
    await this.audit.record({
      adminId,
      action: 'user.create',
      targetType: 'user',
      targetId: user.id,
      afterData: { id: user.id, email: user.email, name: user.name },
    });
    return user;
  }

  async detail(id: string) {
    const user = await applicationDb.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const users = await applicationDb.user.findMany({ orderBy: { createdAt: 'desc' } });
    return users.find((candidate) => candidate.id === id) ?? user;
  }

  async updateStatus(id: string, isActive: boolean, adminId?: string) {
    const before = await this.detail(id);
    const updated = await applicationDb.user.update({ where: { id }, data: { isActive } });
    await this.audit.record({
      adminId,
      action: 'user.status.update',
      targetType: 'user',
      targetId: id,
      beforeData: { isActive: before.isActive },
      afterData: { isActive: updated.isActive },
    });
    return updated;
  }

  async bulkUpdateStatus(ids: string[], isActive: boolean, adminId?: string) {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    for (const id of uniqueIds) {
      await this.updateStatus(id, isActive, adminId);
    }
  }

  async resetPassword(id: string, adminId?: string) {
    const before = await this.detail(id);
    const passwordHash = await bcrypt.hash(this.defaultTemporaryPassword(), 10);
    const updated = await applicationDb.user.update({ where: { id }, data: { passwordHash } });
    await this.audit.record({
      adminId,
      action: 'user.password.reset',
      targetType: 'user',
      targetId: id,
      beforeData: { email: before.email },
      afterData: { email: updated.email },
    });
    return updated;
  }

  async delete(id: string, adminId?: string) {
    const before = await this.detail(id);
    await applicationDb.user.delete({ where: { id } });
    await this.audit.record({
      adminId,
      action: 'user.delete',
      targetType: 'user',
      targetId: id,
      beforeData: { id: before.id, email: before.email, name: before.name },
    });
  }

  async bulkDelete(ids: string[], adminId?: string) {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    for (const id of uniqueIds) {
      await this.delete(id, adminId);
    }
  }

  private filterUsers(users: UserRow[], query: UserListQuery) {
    const search = query.search?.trim().toLowerCase();
    const email = query.email?.trim().toLowerCase();
    const registeredStart = this.registeredStart(query.registered);
    return users.filter((user) => {
      const businessCount = user.businesses?.length ?? 0;
      const matchesSearch = !search || user.name.toLowerCase().includes(search);
      const matchesEmail = !email || user.email.toLowerCase().includes(email);
      const matchesStatus =
        !query.status ||
        (query.status === 'active' && user.isActive) ||
        (query.status === 'suspended' && !user.isActive);
      const matchesBusinessCount =
        !query.businessCount ||
        (query.businessCount === 'none' && businessCount === 0) ||
        (query.businessCount === 'one' && businessCount === 1) ||
        (query.businessCount === 'multi' && businessCount > 1);
      const matchesRegistered = !registeredStart || user.createdAt >= registeredStart;
      const matchesBusinessId = !query.businessId || user.businesses?.some((businessUser) => businessUser.businessId === query.businessId);

      return matchesSearch && matchesEmail && matchesStatus && matchesBusinessCount && matchesRegistered && matchesBusinessId;
    });
  }

  private sortUsers(users: UserRow[], sort = 'newest') {
    return [...users].sort((left, right) => {
      if (sort === 'oldest') return left.createdAt.getTime() - right.createdAt.getTime();
      if (sort === 'name') return left.name.localeCompare(right.name);
      if (sort === 'email') return left.email.localeCompare(right.email);
      if (sort === 'status') return Number(right.isActive) - Number(left.isActive);
      if (sort === 'businesses') return (right.businesses?.length ?? 0) - (left.businesses?.length ?? 0);
      return right.createdAt.getTime() - left.createdAt.getTime();
    });
  }

  private dedupe(users: UserRow[]) {
    const seen = new Map<string, UserRow>();
    for (const user of users) {
      if (!seen.has(user.id)) {
        seen.set(user.id, user);
      }
    }
    return [...seen.values()];
  }

  private formatName(name: string) {
    return name
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private registeredStart(value?: string) {
    const days = value === '7' ? 7 : value === '30' ? 30 : value === '90' ? 90 : null;
    if (!days) return null;
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }

  private defaultTemporaryPassword() {
    return process.env.DEFAULT_USER_PASSWORD || 'Temp@12345';
  }

  private toPositiveNumber(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
