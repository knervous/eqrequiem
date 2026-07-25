export interface RaceEntry {
    0: string;
    1: string;
    2: string;
    name: string;
    scale?: number;
    height?: number;
}
interface RaceData {
    [key: number]: RaceEntry;
}
export declare const RACE_DATA: RaceData;
export default RACE_DATA;
