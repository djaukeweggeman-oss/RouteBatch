export interface Address {
    filiaalnr: string;
    formule: string;
    straat: string;
    postcode: string;
    plaats: string;
    volledigAdres: string;
    merchandiser: string;
    lat?: number;
    lng?: number;
    aantalPlaatsingen?: number;
    bezoekdag?: string;
    terr?: string;
    boxName?: string;
}

export interface RouteResponse {
    stops: Address[];
    totalDistance?: number;
    totalDuration?: number;
    geometry?: string; // Encoded polyline
}

export interface DayRoute {
    bezoekdag: string;
    stops: Address[];
    totalDistanceKm: number;
    totalDurationMin: number;
    totalPlaatsingen: number;
}

export interface MultiDayRouteResponse {
    days: DayRoute[];
}

export interface BatchRouteResult {
    terr: string;
    merchandiser: string;
    boxName: string;
    stops: Address[];
    totalDistanceKm: number;
    totalDurationMin: number;
    totalPlaatsingen: number;
}

export interface ExcelRow {
    TERRNR?: string | number;
    Merchandiser?: string;
    Bezoekdag?: string;
    Box?: string | number;
    FILIAALNR?: string | number;
    FORMULE?: string;
    ADRES?: string;
    POSTCODE?: string;
    PLAATSNAAM?: string;
    Opmerkingen?: string;
    [key: string]: any;
}
