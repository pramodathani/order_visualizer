import { useSyncExternalStore } from 'react';

import type { MarketMoment } from '../api/types';
import type { PlanHighlight } from '../three/planTreeScene';

/** Which page the viewer shows. */
export type ViewName = 'order' | 'day';

/** A request to fly the skyline's camera to one column. */
export interface DayFocus {
  day: string;
  syntheticType: string;
  bucketStart: number;
  request: number;
}

/** What the page shows, as reported to the chat with each question. */
export interface ReportedView {
  parentOrderId: string | null;
  marketMoment: MarketMoment | null;
  day: string | null;
  columnType: string | null;
  columnBucketStart: number | null;
}

/** The shared state that lets the chat steer the pages, and lets the pages tell the chat what they show. */
interface BridgeState {
  view: ViewName;
  highlight: PlanHighlight | null;
  marketMoment: MarketMoment | null;
  marketMomentRequest: number;
  dayRequest: {
    day: string;
    request: number;
  } | null;
  dayFocus: DayFocus | null;
  reported: ReportedView;
}

/** A small store shared by the header, both pages and the chat box. */
export class ViewBridge {
  private state: BridgeState;
  private readonly listeners = new Set<() => void>();
  private requestCounter = 0;

  /** Starts on the page the address names. */
  constructor() {
    this.state = {
      view: window.location.hash.startsWith('#day') ? 'day' : 'order',
      highlight: null,
      marketMoment: null,
      marketMomentRequest: 0,
      dayRequest: null,
      dayFocus: null,
      reported: {
        parentOrderId: null,
        marketMoment: null,
        day: null,
        columnType: null,
        columnBucketStart: null,
      },
    };
  }

  /**
   * Reads the current state.
   * @returns The state; a new object whenever anything changed.
   */
  snapshot = (): BridgeState => this.state;

  /**
   * Registers a listener for changes.
   * @param listener Called after every change.
   * @returns A function that removes the listener.
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Switches page.
   * @param view The page to show.
   */
  showView(view: ViewName): void {
    this.change({
      view,
    });
  }

  /**
   * Opens one order in the one-order view.
   * @param parentOrderId The order's id.
   */
  showOrder(parentOrderId: string): void {
    this.change({
      view: 'order',
      highlight: null,
    });
    window.location.hash = `#order=${parentOrderId}`;
  }

  /**
   * Keeps some parts and legs bright, or clears that.
   * @param highlight The parts and legs, or null.
   */
  setHighlight(highlight: PlanHighlight | null): void {
    this.change({
      highlight,
    });
  }

  /**
   * Asks the order book to show another moment.
   * @param moment The moment.
   */
  requestMarketMoment(moment: MarketMoment): void {
    this.requestCounter += 1;
    this.change({
      marketMoment: moment,
      marketMomentRequest: this.requestCounter,
    });
  }

  /**
   * Opens the skyline of one day.
   * @param day The day as YYYY-MM-DD.
   */
  showDay(day: string): void {
    this.requestCounter += 1;
    this.change({
      view: 'day',
      dayRequest: {
        day,
        request: this.requestCounter,
      },
    });
  }

  /**
   * Opens a day's skyline and flies to one column.
   * @param day The day as YYYY-MM-DD.
   * @param syntheticType The column's order type.
   * @param bucketStart The epoch start of the column's minute.
   */
  focusDayColumn(day: string, syntheticType: string, bucketStart: number): void {
    this.requestCounter += 1;
    this.change({
      view: 'day',
      dayFocus: {
        day,
        syntheticType,
        bucketStart,
        request: this.requestCounter,
      },
    });
  }

  /**
   * Records what a page shows, for the chat.
   * @param reported The fields the page knows about.
   */
  report(reported: Partial<ReportedView>): void {
    const merged = {
      ...this.state.reported,
      ...reported,
    };
    const unchanged = Object.keys(merged).every(
      (key) => merged[key as keyof ReportedView] === this.state.reported[key as keyof ReportedView],
    );
    if (!unchanged) {
      this.change({
        reported: merged,
      });
    }
  }

  /**
   * Applies a change and tells every listener.
   * @param partial The fields that change.
   */
  private change(partial: Partial<BridgeState>): void {
    this.state = {
      ...this.state,
      ...partial,
    };
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const viewBridge = new ViewBridge();

/**
 * Follows the bridge's state from a component.
 * @returns The current state.
 */
export function useViewBridge(): BridgeState {
  return useSyncExternalStore(viewBridge.subscribe, viewBridge.snapshot);
}
