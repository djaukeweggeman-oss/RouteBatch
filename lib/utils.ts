import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { DayRoute } from "@/types";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Sort day routes by Dutch day name order
 * Handles both Dutch day names (Maandag, Dinsdag, etc.) and partial matches
 */
export function sortDayRoutes(days: DayRoute[]): DayRoute[] {
    const dayOrder: Record<string, number> = {
        'maandag': 1,
        'dinsdag': 2,
        'woensdag': 3,
        'donderdag': 4,
        'vrijdag': 5,
        'zaterdag': 6,
        'zondag': 7,
    };

    return [...days].sort((a, b) => {
        const dayA = a.bezoekdag.toLowerCase().split(' ')[0].substring(0, 8);
        const dayB = b.bezoekdag.toLowerCase().split(' ')[0].substring(0, 8);
        
        const orderA = Object.entries(dayOrder).find(([key]) => dayA.includes(key))?.[1] ?? 999;
        const orderB = Object.entries(dayOrder).find(([key]) => dayB.includes(key))?.[1] ?? 999;
        
        return orderA - orderB;
    });
}
