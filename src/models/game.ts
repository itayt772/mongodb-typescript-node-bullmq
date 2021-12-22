import { ObjectId } from "mongodb";
import Author from "./author";

export default interface Game {
    name: string;
    price: number;
    category: string;
    id?: ObjectId;
    gameScanPeriod: number;
    authors: Author[];
    dateCreated: Date;
}
