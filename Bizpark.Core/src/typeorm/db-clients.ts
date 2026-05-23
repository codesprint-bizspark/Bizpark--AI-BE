import { DataSource, In, IsNull } from 'typeorm';
import { getAdminDataSource, getApplicationDataSource, getRunnerDataSource } from './datasources';
import {
    AdminAuditLogEntity,
    AdminTemplateEntity,
    AdminUserEntity,
    ApiAiGenerationEntity,
    ApiBusinessEntity,
    ApiBusinessUserEntity,
    ApiPublishingLogEntity,
    ApiSocialAccountEntity,
    ApiSocialPostEntity,
    ApiSocialPostMediaEntity,
    ApiSubscriptionEntity,
    ApiUserEntity,
    ApiWebsiteEntity,
    BusinessStatus,
    RunnerAgentTaskEntity,
    SocialAccountStatus,
    SocialPlatform,
    SocialPostStatus,
    SubscriptionStatus,
    SubscriptionTier,
    TaskStatus,
    UserRole,
    WebsiteStatus,
} from './entities';

type OrderDirection = 'asc' | 'desc' | 'ASC' | 'DESC';

const dataSourceInitPromises = new Map<DataSource, Promise<DataSource>>();

const ensureDataSourceInitialized = async (dataSource: DataSource): Promise<DataSource> => {
    if (dataSource.isInitialized) {
        return dataSource;
    }

    const existingInit = dataSourceInitPromises.get(dataSource);
    if (existingInit) {
        return existingInit;
    }

    const initPromise = dataSource.initialize();
    dataSourceInitPromises.set(dataSource, initPromise);

    try {
        return await initPromise;
    } finally {
        dataSourceInitPromises.delete(dataSource);
    }
};

const resolveOrder = (direction?: OrderDirection) => {
    if (!direction) {
        return undefined;
    }
    return String(direction).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
};

const createApplicationClient = () => ({
    user: {
        findUnique: async (args: { where: { id?: string; email?: string } }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiUserEntity);
            if (args.where.id) {
                return repo.findOne({ where: { id: args.where.id } });
            }
            if (args.where.email) {
                return repo.findOne({ where: { email: args.where.email } });
            }
            return null;
        },
        create: async (args: { data: Pick<ApiUserEntity, 'email' | 'name' | 'passwordHash'> }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiUserEntity);
            const entity = repo.create(args.data);
            return repo.save(entity);
        },
        findMany: async (args?: { orderBy?: { createdAt?: OrderDirection } }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiUserEntity);
            return repo.find({
                relations: ['businesses', 'businesses.business'],
                order: args?.orderBy?.createdAt
                    ? { createdAt: resolveOrder(args.orderBy.createdAt) as 'ASC' | 'DESC' }
                    : undefined,
            });
        },
        update: async (args: { where: { id: string }; data: Partial<ApiUserEntity> }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiUserEntity);
            const existing = await repo.findOne({ where: { id: args.where.id } });
            if (!existing) {
                throw new Error(`User ${args.where.id} not found`);
            }
            repo.merge(existing, args.data);
            return repo.save(existing);
        },
        count: async () => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            return ds.getRepository(ApiUserEntity).count();
        },
    },
    business: {
        create: async (args: {
            data: {
                name: string;
                category?: string | null;
                description?: string | null;
                logoUrl?: string | null;
                subscriptionTier?: SubscriptionTier;
                status?: BusinessStatus;
                users?: {
                    create?: { userId: string; role?: UserRole | string } | Array<{ userId: string; role?: UserRole | string }>;
                };
            };
        }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            return ds.transaction(async (manager) => {
                const { users, ...businessData } = args.data;
                const business = manager.create(ApiBusinessEntity, {
                    ...businessData,
                    status: businessData.status ?? BusinessStatus.ACTIVE,
                });
                const savedBusiness = await manager.save(ApiBusinessEntity, business);

                const createUsers = users?.create
                    ? Array.isArray(users.create)
                        ? users.create
                        : [users.create]
                    : [];

                for (const createUser of createUsers) {
                    const businessUser = manager.create(ApiBusinessUserEntity, {
                        userId: createUser.userId,
                        businessId: savedBusiness.id,
                        role: (createUser.role as UserRole) || UserRole.EDITOR,
                    });
                    await manager.save(ApiBusinessUserEntity, businessUser);
                }

                return savedBusiness;
            });
        },
        findMany: async (args?: {
            where?: { users?: { some?: { userId?: string } } };
            orderBy?: { createdAt?: OrderDirection };
        }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiBusinessEntity);
            const qb = repo.createQueryBuilder('business');

            const userId = args?.where?.users?.some?.userId;
            if (userId) {
                qb.innerJoin(ApiBusinessUserEntity, 'business_user', 'business_user.businessId = business.id');
                qb.andWhere('business_user.userId = :userId', { userId });
            }

            const order = resolveOrder(args?.orderBy?.createdAt);
            if (order) {
                qb.orderBy('business.createdAt', order);
            }

            return qb.getMany();
        },
        findUnique: async (args: { where: { id: string }; include?: { websites?: boolean } }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiBusinessEntity);
            return repo.findOne({
                where: { id: args.where.id },
                relations: args.include?.websites ? ['websites'] : [],
            });
        },
        findForAdmin: async (args?: { orderBy?: { createdAt?: OrderDirection } }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiBusinessEntity);
            return repo.find({
                relations: ['users', 'users.user', 'websites', 'subscriptions'],
                order: args?.orderBy?.createdAt
                    ? { createdAt: resolveOrder(args.orderBy.createdAt) as 'ASC' | 'DESC' }
                    : { createdAt: 'DESC' },
            });
        },
        findUniqueForAdmin: async (args: { where: { id: string } }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            return ds.getRepository(ApiBusinessEntity).findOne({
                where: { id: args.where.id },
                relations: ['users', 'users.user', 'websites', 'subscriptions'],
            });
        },
        update: async (args: { where: { id: string }; data: Partial<ApiBusinessEntity> }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiBusinessEntity);
            const existing = await repo.findOne({ where: { id: args.where.id } });
            if (!existing) {
                throw new Error(`Business ${args.where.id} not found`);
            }
            repo.merge(existing, args.data);
            return repo.save(existing);
        },
        count: async (args?: { where?: { status?: BusinessStatus } }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            return ds.getRepository(ApiBusinessEntity).count({
                where: args?.where?.status ? { status: args.where.status } : undefined,
            });
        },
    },
    website: {
        upsert: async (args: {
            where: { domain?: string | null };
            update: Partial<ApiWebsiteEntity>;
            create: Partial<ApiWebsiteEntity>;
        }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiWebsiteEntity);

            const domain = args.where.domain ?? args.create.domain ?? null;
            const existing = domain ? await repo.findOne({ where: { domain } }) : null;

            if (existing) {
                repo.merge(existing, args.update);
                return repo.save(existing);
            }

            const created = repo.create({
                ...args.create,
                domain,
                status: args.create.status ?? WebsiteStatus.DRAFT,
            });
            return repo.save(created);
        },
        findMany: async (args?: { orderBy?: { createdAt?: OrderDirection } }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            return ds.getRepository(ApiWebsiteEntity).find({
                relations: ['business'],
                order: args?.orderBy?.createdAt
                    ? { createdAt: resolveOrder(args.orderBy.createdAt) as 'ASC' | 'DESC' }
                    : { createdAt: 'DESC' },
            });
        },
        findUnique: async (args: { where: { id: string } }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            return ds.getRepository(ApiWebsiteEntity).findOne({
                where: { id: args.where.id },
                relations: ['business'],
            });
        },
        findFirstByBusinessId: async (args: { businessId: string }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            return ds.getRepository(ApiWebsiteEntity).findOne({
                where: { businessId: args.businessId },
                relations: ['business'],
                order: { createdAt: 'DESC' },
            });
        },
        update: async (args: { where: { id: string }; data: Partial<ApiWebsiteEntity> }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiWebsiteEntity);
            const existing = await repo.findOne({ where: { id: args.where.id } });
            if (!existing) {
                throw new Error(`Website ${args.where.id} not found`);
            }
            repo.merge(existing, args.data);
            return repo.save(existing);
        },
        count: async (args?: { where?: { status?: WebsiteStatus } }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            return ds.getRepository(ApiWebsiteEntity).count({
                where: args?.where?.status ? { status: args.where.status } : undefined,
            });
        },
    },
    subscription: {
        findMany: async (args?: { orderBy?: { createdAt?: OrderDirection } }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            return ds.getRepository(ApiSubscriptionEntity).find({
                relations: ['business'],
                order: args?.orderBy?.createdAt
                    ? { createdAt: resolveOrder(args.orderBy.createdAt) as 'ASC' | 'DESC' }
                    : { createdAt: 'DESC' },
            });
        },
        findLatestForBusiness: async (args: { businessId: string }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            return ds.getRepository(ApiSubscriptionEntity).findOne({
                where: { businessId: args.businessId },
                order: { createdAt: 'DESC' },
            });
        },
        upsertForBusiness: async (args: {
            businessId: string;
            data: Partial<ApiSubscriptionEntity> & { tier?: SubscriptionTier; status?: SubscriptionStatus };
        }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiSubscriptionEntity);
            const existing = await repo.findOne({
                where: { businessId: args.businessId },
                order: { createdAt: 'DESC' },
            });
            if (existing) {
                repo.merge(existing, args.data);
                return repo.save(existing);
            }
            return repo.save(repo.create({ ...args.data, businessId: args.businessId }));
        },
        count: async (args?: { where?: { status?: SubscriptionStatus } }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            return ds.getRepository(ApiSubscriptionEntity).count({
                where: args?.where?.status ? { status: args.where.status } : undefined,
            });
        },
    },
    socialAccount: {
        findMany: async (args: {
            where: { businessId: string; platform?: SocialPlatform; status?: SocialAccountStatus };
        }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiSocialAccountEntity);
            const where: Record<string, unknown> = {
                businessId: args.where.businessId,
                deletedAt: IsNull(),
            };
            if (args.where.platform) where.platform = args.where.platform;
            if (args.where.status) where.status = args.where.status;
            return repo.find({ where, order: { createdAt: 'DESC' } });
        },
        findUnique: async (args: { where: { id: string } }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            return ds.getRepository(ApiSocialAccountEntity).findOne({ where: { id: args.where.id } });
        },
        findActiveByBusinessAndPlatform: async (args: {
            businessId: string;
            platform: SocialPlatform;
            externalAccountId?: string;
        }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const where: Record<string, unknown> = {
                businessId: args.businessId,
                platform: args.platform,
                deletedAt: IsNull(),
            };
            if (args.externalAccountId) where.externalAccountId = args.externalAccountId;
            return ds.getRepository(ApiSocialAccountEntity).findOne({ where, order: { createdAt: 'DESC' } });
        },
        upsert: async (args: { data: Partial<ApiSocialAccountEntity> }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiSocialAccountEntity);
            if (!args.data.businessId || !args.data.platform || !args.data.externalAccountId) {
                throw new Error('businessId, platform and externalAccountId are required');
            }
            const existing = await repo.findOne({
                where: {
                    businessId: args.data.businessId,
                    platform: args.data.platform,
                    externalAccountId: args.data.externalAccountId,
                    deletedAt: IsNull(),
                },
            });
            if (existing) {
                repo.merge(existing, { ...args.data, status: args.data.status ?? SocialAccountStatus.CONNECTED });
                return repo.save(existing);
            }
            const entity = repo.create({
                ...args.data,
                status: args.data.status ?? SocialAccountStatus.CONNECTED,
            });
            return repo.save(entity);
        },
        update: async (args: { where: { id: string }; data: Partial<ApiSocialAccountEntity> }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiSocialAccountEntity);
            const existing = await repo.findOne({ where: { id: args.where.id } });
            if (!existing) throw new Error(`SocialAccount ${args.where.id} not found`);
            repo.merge(existing, args.data);
            return repo.save(existing);
        },
        softDelete: async (args: { where: { id: string } }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiSocialAccountEntity);
            const existing = await repo.findOne({ where: { id: args.where.id } });
            if (!existing) return null;
            existing.status = SocialAccountStatus.DISCONNECTED;
            existing.deletedAt = new Date();
            return repo.save(existing);
        },
    },
    socialPost: {
        create: async (args: { data: Partial<ApiSocialPostEntity> }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiSocialPostEntity);
            return repo.save(repo.create(args.data));
        },
        findUnique: async (args: { where: { id: string }; include?: { media?: boolean; logs?: boolean } }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const relations: string[] = [];
            if (args.include?.media) relations.push('media');
            if (args.include?.logs) relations.push('publishingLogs');
            return ds.getRepository(ApiSocialPostEntity).findOne({
                where: { id: args.where.id },
                relations,
            });
        },
        findMany: async (args: {
            where: { businessId: string; status?: SocialPostStatus; platform?: SocialPlatform };
            orderBy?: { createdAt?: OrderDirection; scheduledAt?: OrderDirection };
            take?: number;
        }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiSocialPostEntity);
            const where: Record<string, unknown> = {
                businessId: args.where.businessId,
                deletedAt: IsNull(),
            };
            if (args.where.status) where.status = args.where.status;
            if (args.where.platform) where.platform = args.where.platform;
            const order: Record<string, 'ASC' | 'DESC'> = {};
            if (args.orderBy?.scheduledAt) {
                order.scheduledAt = resolveOrder(args.orderBy.scheduledAt) as 'ASC' | 'DESC';
            }
            if (args.orderBy?.createdAt) {
                order.createdAt = resolveOrder(args.orderBy.createdAt) as 'ASC' | 'DESC';
            }
            if (Object.keys(order).length === 0) order.createdAt = 'DESC';
            return repo.find({ where, order, take: args.take, relations: ['media'] });
        },
        findDueForPublishing: async (args: { now: Date; limit?: number }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiSocialPostEntity);
            return repo
                .createQueryBuilder('post')
                .where('post.status = :status', { status: SocialPostStatus.SCHEDULED })
                .andWhere('post.scheduledAt <= :now', { now: args.now })
                .andWhere('post.deletedAt IS NULL')
                .orderBy('post.scheduledAt', 'ASC')
                .take(args.limit ?? 50)
                .getMany();
        },
        update: async (args: { where: { id: string }; data: Partial<ApiSocialPostEntity> }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiSocialPostEntity);
            const existing = await repo.findOne({ where: { id: args.where.id } });
            if (!existing) throw new Error(`SocialPost ${args.where.id} not found`);
            repo.merge(existing, args.data);
            return repo.save(existing);
        },
        softDelete: async (args: { where: { id: string } }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiSocialPostEntity);
            const existing = await repo.findOne({ where: { id: args.where.id } });
            if (!existing) return null;
            existing.deletedAt = new Date();
            existing.status = SocialPostStatus.CANCELLED;
            return repo.save(existing);
        },
    },
    socialPostMedia: {
        create: async (args: { data: Partial<ApiSocialPostMediaEntity> }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiSocialPostMediaEntity);
            return repo.save(repo.create(args.data));
        },
        findManyByPost: async (args: { postId: string }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            return ds.getRepository(ApiSocialPostMediaEntity).find({
                where: { postId: args.postId, deletedAt: IsNull() },
                order: { position: 'ASC', createdAt: 'ASC' },
            });
        },
        softDelete: async (args: { where: { id: string } }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiSocialPostMediaEntity);
            const existing = await repo.findOne({ where: { id: args.where.id } });
            if (!existing) return null;
            existing.deletedAt = new Date();
            return repo.save(existing);
        },
    },
    aiGeneration: {
        create: async (args: { data: Partial<ApiAiGenerationEntity> }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiAiGenerationEntity);
            return repo.save(repo.create(args.data));
        },
        findManyByPost: async (args: { postId: string }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            return ds.getRepository(ApiAiGenerationEntity).find({
                where: { postId: args.postId, deletedAt: IsNull() },
                order: { createdAt: 'DESC' },
            });
        },
        findManyByBusiness: async (args: { businessId: string; take?: number }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            return ds.getRepository(ApiAiGenerationEntity).find({
                where: { businessId: args.businessId, deletedAt: IsNull() },
                order: { createdAt: 'DESC' },
                take: args.take ?? 50,
            });
        },
    },
    publishingLog: {
        create: async (args: { data: Partial<ApiPublishingLogEntity> }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiPublishingLogEntity);
            return repo.save(repo.create(args.data));
        },
        update: async (args: { where: { id: string }; data: Partial<ApiPublishingLogEntity> }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            const repo = ds.getRepository(ApiPublishingLogEntity);
            const existing = await repo.findOne({ where: { id: args.where.id } });
            if (!existing) throw new Error(`PublishingLog ${args.where.id} not found`);
            repo.merge(existing, args.data);
            return repo.save(existing);
        },
        findManyByPost: async (args: { postId: string }) => {
            const ds = await ensureDataSourceInitialized(getApplicationDataSource());
            return ds.getRepository(ApiPublishingLogEntity).find({
                where: { postId: args.postId },
                order: { createdAt: 'DESC' },
            });
        },
    },
    $disconnect: async () => {
        const ds = getApplicationDataSource();
        if (ds.isInitialized) {
            await ds.destroy();
        }
    },
});

const createAdminClient = () => ({
    adminUser: {
        findUnique: async (args: { where: { id?: string; email?: string } }) => {
            const ds = await ensureDataSourceInitialized(getAdminDataSource());
            const repo = ds.getRepository(AdminUserEntity);
            if (args.where.id) {
                return repo.findOne({ where: { id: args.where.id } });
            }
            if (args.where.email) {
                return repo.findOne({ where: { email: args.where.email } });
            }
            return null;
        },
        findMany: async () => {
            const ds = await ensureDataSourceInitialized(getAdminDataSource());
            return ds.getRepository(AdminUserEntity).find({ order: { createdAt: 'DESC' } });
        },
        create: async (args: { data: Partial<AdminUserEntity> }) => {
            const ds = await ensureDataSourceInitialized(getAdminDataSource());
            return ds.getRepository(AdminUserEntity).save(ds.getRepository(AdminUserEntity).create(args.data));
        },
        count: async () => {
            const ds = await ensureDataSourceInitialized(getAdminDataSource());
            return ds.getRepository(AdminUserEntity).count();
        },
    },
    auditLog: {
        create: async (args: { data: Partial<AdminAuditLogEntity> }) => {
            const ds = await ensureDataSourceInitialized(getAdminDataSource());
            const repo = ds.getRepository(AdminAuditLogEntity);
            return repo.save(repo.create(args.data));
        },
        findMany: async (args?: { orderBy?: { createdAt?: OrderDirection } }) => {
            const ds = await ensureDataSourceInitialized(getAdminDataSource());
            return ds.getRepository(AdminAuditLogEntity).find({
                order: args?.orderBy?.createdAt
                    ? { createdAt: resolveOrder(args.orderBy.createdAt) as 'ASC' | 'DESC' }
                    : { createdAt: 'DESC' },
                take: 100,
            });
        },
    },
    template: {
        findMany: async (args?: {
            where?: { type?: string; name?: { in?: string[] } };
            orderBy?: { createdAt?: OrderDirection };
            select?: Record<string, boolean>;
        }) => {
            const ds = await ensureDataSourceInitialized(getAdminDataSource());
            const repo = ds.getRepository(AdminTemplateEntity);

            const where: Record<string, unknown> = {};
            if (args?.where?.type) {
                where.type = args.where.type;
            }
            if (args?.where?.name?.in?.length) {
                where.name = In(args.where.name.in);
            }

            const result = await repo.find({
                where: Object.keys(where).length ? where : undefined,
                order: args?.orderBy?.createdAt
                    ? { createdAt: resolveOrder(args.orderBy.createdAt) as 'ASC' | 'DESC' }
                    : undefined,
            });

            if (!args?.select) {
                return result;
            }

            return result.map((row) => {
                const picked: Record<string, unknown> = {};
                for (const [key, enabled] of Object.entries(args.select || {})) {
                    if (enabled) {
                        picked[key] = (row as unknown as Record<string, unknown>)[key];
                    }
                }
                return picked;
            });
        },
        findUnique: async (args: { where: { id: string } }) => {
            const ds = await ensureDataSourceInitialized(getAdminDataSource());
            const repo = ds.getRepository(AdminTemplateEntity);
            return repo.findOne({ where: { id: args.where.id } });
        },
        create: async (args: { data: Partial<AdminTemplateEntity> }) => {
            const ds = await ensureDataSourceInitialized(getAdminDataSource());
            const repo = ds.getRepository(AdminTemplateEntity);
            const entity = repo.create(args.data);
            return repo.save(entity);
        },
        update: async (args: { where: { id: string }; data: Partial<AdminTemplateEntity> }) => {
            const ds = await ensureDataSourceInitialized(getAdminDataSource());
            const repo = ds.getRepository(AdminTemplateEntity);
            const existing = await repo.findOne({ where: { id: args.where.id } });
            if (!existing) {
                throw new Error(`Template ${args.where.id} not found`);
            }
            repo.merge(existing, args.data);
            return repo.save(existing);
        },
    },
    $disconnect: async () => {
        const ds = getAdminDataSource();
        if (ds.isInitialized) {
            await ds.destroy();
        }
    },
});

const createRunnerClient = () => ({
    agentTask: {
        create: async (args: { data: Partial<RunnerAgentTaskEntity> }) => {
            const ds = await ensureDataSourceInitialized(getRunnerDataSource());
            const repo = ds.getRepository(RunnerAgentTaskEntity);
            const entity = repo.create(args.data);
            return repo.save(entity);
        },
        update: async (args: { where: { id: string }; data: Partial<RunnerAgentTaskEntity> }) => {
            const ds = await ensureDataSourceInitialized(getRunnerDataSource());
            const repo = ds.getRepository(RunnerAgentTaskEntity);
            const existing = await repo.findOne({ where: { id: args.where.id } });
            if (!existing) {
                throw new Error(`Agent task ${args.where.id} not found`);
            }
            repo.merge(existing, args.data);
            return repo.save(existing);
        },
        findUnique: async (args: { where: { id: string } }) => {
            const ds = await ensureDataSourceInitialized(getRunnerDataSource());
            const repo = ds.getRepository(RunnerAgentTaskEntity);
            return repo.findOne({ where: { id: args.where.id } });
        },
        findMany: async (args?: { orderBy?: { createdAt?: OrderDirection } }) => {
            const ds = await ensureDataSourceInitialized(getRunnerDataSource());
            const repo = ds.getRepository(RunnerAgentTaskEntity);
            return repo.find({
                order: args?.orderBy?.createdAt
                    ? { createdAt: resolveOrder(args.orderBy.createdAt) as 'ASC' | 'DESC' }
                    : undefined,
            });
        },
        count: async (args?: { where?: { status?: string } }) => {
            const ds = await ensureDataSourceInitialized(getRunnerDataSource());
            return ds.getRepository(RunnerAgentTaskEntity).count({
                where: args?.where?.status ? { status: args.where.status as TaskStatus } : undefined,
            });
        },
    },
    $disconnect: async () => {
        const ds = getRunnerDataSource();
        if (ds.isInitialized) {
            await ds.destroy();
        }
    },
});

export const applicationDb = createApplicationClient();
export const adminDb = createAdminClient();
export const runnerDb = createRunnerClient();
