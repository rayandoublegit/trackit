// Automatic SMTP outreach (mailbox connection, sequences) is parked: its UI
// shows only when NEXT_PUBLIC_AUTO_OUTREACH=1. Routes and crons stay in place.
export const AUTO_OUTREACH_ENABLED = process.env.NEXT_PUBLIC_AUTO_OUTREACH === "1";
