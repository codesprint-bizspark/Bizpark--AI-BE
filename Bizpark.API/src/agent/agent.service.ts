import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CreateAgentTaskDto, runnerDb, TaskStatus } from 'bizpark.core';
import { randomUUID } from 'crypto';
import { UsageService } from '../usage/usage.service';

@Injectable()
export class AgentService {
    constructor(
        @InjectQueue('agent-queue') private agentQueue: Queue,
        private readonly usageService: UsageService,
    ) { }

    async queueTask(dto: CreateAgentTaskDto) {
        const taskId = randomUUID();
        const reservation = await this.usageService.reserveForTask({ ...dto, taskId });
        const inputData = {
            ...(dto.inputData || {}),
            ...(dto.createdByUserId ? { createdByUserId: dto.createdByUserId } : {}),
            ...(reservation?.reservationId ? { usageReservationId: reservation.reservationId } : {}),
        };

        try {
            // Pre-create so polling immediately finds QUEUED status (before worker picks it up)
            await runnerDb.agentTask.create({
                data: {
                    id: taskId,
                    businessId: dto.businessId,
                    taskType: dto.taskType,
                    status: TaskStatus.QUEUED,
                    inputData,
                },
            });

            await this.agentQueue.add('agent-job', {
                ...dto,
                inputData,
                taskId,
                createdByUserId: dto.createdByUserId,
                usageReservationId: reservation?.reservationId,
            });
        } catch (error) {
            if (reservation?.reservationId) {
                await this.usageService.commitReservation({
                    reservationId: reservation.reservationId,
                    status: 'RELEASED',
                }).catch(() => undefined);
            }
            throw error;
        }

        return {
            success: true,
            message: 'Agent task has been queued.',
            taskId,
            status: 'queued',
            usageReservationId: reservation?.reservationId,
        };
    }
}
