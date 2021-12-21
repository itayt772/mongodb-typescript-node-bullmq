import { ObjectId } from "mongodb";

export default interface Author {
    id?: ObjectId;
    fullName: string;
    age: number;
    scanJob?: number;
    status?: string;
}
