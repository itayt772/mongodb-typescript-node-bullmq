import { ObjectId } from "mongodb";

export default interface ScanJob {
    dateCreated?: Date;
    scanDueDate: number;
    dateCompleted?: Date;
    status?: string;
    id?: ObjectId;
    assetId: ObjectId;
}
