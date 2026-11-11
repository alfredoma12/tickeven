import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type TicketAttendee = { name: string; rut: string };

export type OrderItemAttendees = {
  event_id: string;
  ticket_type_id: string;
  quantity: number;
  attendees: TicketAttendee[];
};

export async function saveOrderItemAttendees(
  admin: SupabaseClient,
  orderId: string,
  items: OrderItemAttendees[],
) {
  const attendeesByTicketType = new Map<string, TicketAttendee[]>();
  for (const item of items) {
    const key = JSON.stringify([item.event_id, item.ticket_type_id]);
    const attendees = attendeesByTicketType.get(key) ?? [];
    attendees.push(...item.attendees);
    attendeesByTicketType.set(key, attendees);
  }

  const { data: orderItems, error: orderItemsError } = await admin
    .from("order_items")
    .select("id, event_id, ticket_type_id, quantity")
    .eq("order_id", orderId)
    .order("event_id")
    .order("ticket_type_id")
    .order("id");
  if (orderItemsError || !orderItems?.length) {
    throw new Error(`Could not load order items: ${orderItemsError?.message ?? "no items found"}`);
  }

  const offsets = new Map<string, number>();
  for (const item of orderItems) {
    const key = JSON.stringify([item.event_id, item.ticket_type_id]);
    const attendees = attendeesByTicketType.get(key) ?? [];
    const offset = offsets.get(key) ?? 0;
    const itemAttendees = attendees.slice(offset, offset + item.quantity);
    if (itemAttendees.length !== item.quantity) {
      throw new Error("Attendee count does not match the ticket quantity.");
    }
    const { error: updateError } = await admin
      .from("order_items")
      .update({ attendees: itemAttendees })
      .eq("id", item.id);
    if (updateError) throw new Error(`Could not save order-item attendees: ${updateError.message}`);
    offsets.set(key, offset + item.quantity);
  }

  for (const [key, attendees] of attendeesByTicketType) {
    if ((offsets.get(key) ?? 0) !== attendees.length) {
      throw new Error("Attendee count does not match the order-item quantities.");
    }
  }
}