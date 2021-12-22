import { ObjectId } from "mongodb";

export default interface ScanJob {
    id: ObjectId;
    dateCreated: Date;
    scanDueDate: number;
    dateCompleted?: Date;
    status: string;
}
