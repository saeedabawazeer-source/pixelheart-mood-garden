import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const NOTIFY_EMAIL = "saeedabawaeer@gmail.com";

serve(async (req) => {
    // Handle CORS
    if (req.method === "OPTIONS") {
        return new Response(null, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
            },
        });
    }

    try {
        const { mood, date } = await req.json();

        // Send email via Resend
        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
                from: "Shahoodti <onboarding@resend.dev>",
                to: [NOTIFY_EMAIL],
                subject: "💕 New Memory from Saeed!",
                html: `
          <div style="font-family: 'Segoe UI', sans-serif; padding: 20px; background: #FFF0F5; border-radius: 12px;">
            <h1 style="color: #FF69B4; margin: 0;">💕 New Memory!</h1>
            <p style="font-size: 18px; color: #333;">Saeed just captured a new moment:</p>
            <div style="background: white; padding: 16px; border: 3px solid black; margin: 16px 0;">
              <p style="font-size: 24px; font-weight: bold; margin: 0;">${mood || "A quiet moment"}</p>
              <p style="color: #888; margin-top: 8px;">${date}</p>
            </div>
            <p style="color: #666;">Open the app to see it! 📸</p>
          </div>
        `,
            }),
        });

        const data = await res.json();
        console.log("Email sent:", data);

        return new Response(JSON.stringify({ success: true }), {
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
        });
    } catch (error) {
        console.error("Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
        });
    }
});
