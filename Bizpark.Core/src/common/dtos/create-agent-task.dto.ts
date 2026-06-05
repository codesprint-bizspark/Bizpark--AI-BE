import { TaskType } from '../../typeorm/entities/shared/enums';

export class CreateAgentTaskDto {
    businessId!: string;
    taskType!: TaskType;
    inputData!: any;
    createdByUserId?: string;
    usageReservationId?: string;
}
