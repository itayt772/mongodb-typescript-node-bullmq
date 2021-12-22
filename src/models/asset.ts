import { ObjectId } from "mongodb";
import ScanJob from "./scanJob";

export interface Asset {
    id: ObjectId;
    ip: string;
    name: string;
    description?: string;
    dateCreated: Date;
    scanJobs: ScanJob[];
}
