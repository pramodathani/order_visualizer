/** How the server's reading of the event table is going. */
export interface FollowerStatus {
  last_success_at: number | null;
  last_error: string | null;
  last_error_at: number | null;
  rows_loaded: number;
  poll_interval_seconds: number;
}

/** One parent order in the short form the order list uses. */
export interface OrderSummary {
  parent_order_id: string;
  synthetic_type: string | null;
  state: string | null;
  finished: boolean;
  instrument_id: string | null;
  transaction_type: string | null;
  order_type: string | null;
  quantity: number | null;
  price: number | null;
  received_at: number | null;
  updated_at: number | null;
  version: number;
  leg_count: number;
  part_count: number;
}

/** The order list document the server streams. */
export interface OrderList {
  generated_at: number;
  status: FollowerStatus;
  orders: OrderSummary[];
}

/** One state a leg passed through. */
export interface LegStateChange {
  time: number;
  state: string;
}

/** One broker order placed on behalf of a parent. */
export interface Leg {
  leg_id: string;
  role: string | null;
  state: string | null;
  broker: string | null;
  broker_order_id: string | null;
  transaction_type: string | null;
  order_type: string | null;
  quantity: number | null;
  filled_quantity: number | null;
  price: number | null;
  trigger_price: number | null;
  average_price: number | null;
  status_message: string | null;
  requested_at: number | null;
  cancel_requested_at: number | null;
  state_history: LegStateChange[];
}

/** One state a plan part passed through. */
export interface PartStateChange {
  time: number;
  state: string;
  reason: string | null;
}

/** One node of a plan's tree of parts. */
export interface Part {
  path: string;
  state: string | null;
  reason: string | null;
  target: number | null;
  first_seen_at: number;
  state_history: PartStateChange[];
}

/** One event in the order's timeline. */
export interface TimelineEntry {
  time: number;
  sequence: number;
  event: string;
  parent_state: string | null;
  leg_id: string | null;
  leg_state: string | null;
  status_message: string | null;
}

/** One whole parent order, as the 3D view draws it. */
export interface OrderDocument extends OrderSummary {
  body: Record<string, unknown> | null;
  plan: Record<string, unknown> | null;
  legs: Leg[];
  parts: Part[];
  timeline: TimelineEntry[];
}
