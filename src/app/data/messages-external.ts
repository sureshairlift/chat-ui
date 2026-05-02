import { MessagesByConv } from "../models/types";

/**
 * Initial messages, keyed by conversation id.
 * Mirrors React `initialMessages` 1:1.
 *
 * Split into multiple files only for readability — the exported map is one
 * combined object. See messages.ts for the merged export.
 */

export const MESSAGES_EXTERNAL: MessagesByConv = {
  "ext-acme": [
    { id: "exa1", sender: "acme_jane", time: "Tue 4:12 PM",
      text: "Hi team, following up from the customer portal. We're evaluating Q2 freight options and wanted to ask about your container split rates." },
    { id: "exa2", sender: "me", time: "Tue 4:30 PM",
      text: "Hi Jane! Happy to help. Could you share approximate volumes and lanes? I'll put a quote together by EOD tomorrow." },
    { id: "exa3", sender: "acme_jane", time: "Tue 4:35 PM",
      text: "Sure — 40 TEU/month on West Coast routes, mostly LA → Chicago and LA → Dallas. Some seasonal variability in Q3." },
    { id: "exa4", sender: "me", time: "Wed 9:02 AM",
      text: "Got it. Sending the initial proposal over now. The seasonal flex pricing would benefit you here — let me know your thoughts.",
      attachments: [
        { type: "file", name: "Acme-Q2-Quote-v1.pdf", size: "342 KB", ext: "pdf" },
        { type: "file", name: "Rate-Card-2026.docx", size: "89 KB", ext: "docx" },
        { type: "file", name: "Volume-Forecast.xlsx", size: "156 KB", ext: "xlsx" },
        { type: "file", name: "supporting-docs.zip", size: "5.2 MB", ext: "zip" },
      ] },
    { id: "exa5", sender: "acme_jane", time: "8 min",
      text: "When can we expect the revised quote?" },
  ],
  "ext-lighthouse": [
    { id: "exl1", sender: "lighthouse_marc", time: "Yesterday 2:14 PM",
      text: "Hey, our shipper just changed the destination on order #LL-4421. Can we still re-route?" },
    { id: "exl2", sender: "me", time: "Yesterday 2:20 PM",
      text: "Yes, as long as we update before pickup tomorrow morning. What's the new destination?" },
    { id: "exl3", sender: "lighthouse_marc", time: "Yesterday 2:22 PM",
      text: "Phoenix instead of Tucson. Same consignee group." },
    { id: "exl4", sender: "me", time: "1 hr",
      text: "Sharing the routing options shortly" },
  ],
  "ext-northstar": [
    { id: "exn1", sender: "northstar_priya", time: "Yesterday",
      text: "Following up on the contract draft we received. We have feedback from legal on three sections." },
    { id: "exn2", sender: "me", time: "Yesterday",
      text: "Perfect, please share. We can hop on a call if it's easier — Thursday or Friday this week?" },
    { id: "exn3", sender: "northstar_priya", time: "Yesterday",
      text: "Thanks, looking at it now." },
  ],
  "ext-riverstone": [
    { id: "exr1", sender: "riverstone_tom", time: "Yesterday",
      text: "Invoice question — call 3pm?" },
  ],
  "extg-acme-onboarding": [
    { id: "ego1", sender: "shiron", time: "Tue 10:00 AM",
      text: "Welcome everyone! Setting up this group to coordinate Acme's Q2 onboarding. Jane, please feel free to invite anyone from your side." },
    { id: "ego2", sender: "acme_jane", time: "Tue 10:14 AM",
      text: "Thanks Shiron! I've added our ops lead to the customer portal. We're targeting first shipment by week 3." },
    { id: "ego3", sender: "ashwath", time: "Tue 10:20 AM",
      text: "Got it. I'll prep the SOP doc and dashboard access. Ram will own the integration handoff." },
    { id: "ego4", sender: "ram", time: "Tue 4:45 PM",
      text: "Integration kicked off. Will share API docs once Jane's team confirms environment readiness." },
    { id: "ego5", sender: "acme_jane", time: "30 min",
      text: "Sharing the volume forecast 📊 — let me know if anything looks off." },
  ],
  "extg-lighthouse-impl": [
    { id: "egl1", sender: "ram", time: "Mon 9:30 AM",
      text: "Marc, sharing the implementation timeline. We can hit go-live by May 12 if we get the customs API creds by Wednesday." },
    { id: "egl2", sender: "lighthouse_marc", time: "Mon 9:48 AM",
      text: "Working on it. IT should have it ready by tomorrow EOD." },
    { id: "egl3", sender: "arvindh", time: "Mon 11:15 AM",
      text: "Frontend dashboard is staged — sharing preview link in the next message." },
    { id: "egl4", sender: "ram", time: "2 hr",
      text: "Routing dashboard is ready for review" },
  ],
  "extg-northstar-renewal": [
    { id: "egn1", sender: "simi", time: "Yesterday",
      text: "Kicking off renewal discussions for Northstar. Priya, attaching the proposed terms — please share with your legal team." },
    { id: "egn2", sender: "northstar_priya", time: "Yesterday",
      text: "Legal redlines attached" },
  ],
};
