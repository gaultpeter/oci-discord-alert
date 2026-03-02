export default {
  async fetch(request, env) {
    try {
      const webhook = env.DISCORD_WEBHOOK;
      if (!webhook) return new Response("Webhook not configured", { status: 500 });

      // 1. Identify Message Type using Headers (Case-insensitive & Reliable)
      const messageType = request.headers.get("x-oci-ns-messagetype");
      const confirmationUrl = request.headers.get("x-oci-ns-confirmationurl");

      // Handle Subscription Handshake
      if (messageType === "SubscriptionConfirmation" || confirmationUrl) {
        if (confirmationUrl) await fetch(confirmationUrl);
        return new Response("Handshake OK", { status: 200 });
      }

      // 2. Parse Payload
      const ociPayload = await request.json();
      
      // Handle actual Notifications
      if (messageType === "Notification") {
        // OCI uses "Message" or "message" (usually Message)
        const rawMessage = ociPayload.Message || ociPayload.message;
        
        let alarmData = {};
        try {
          alarmData = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;
        } catch {
          alarmData = ociPayload;
        }

        // Map data (handling OCI capitalization)
        const alarmName = alarmData.title || alarmData.alarmName || "OCI Alert";
        const severity = alarmData.severity || "CRITICAL";
        const state = alarmData.state || "FIRING";
        const body = (alarmData.body || "Memory Threshold Exceeded").substring(0, 1000);
        
        const isRecovery = state.includes("OK");

        const discordPayload = {
          embeds: [{
            title: isRecovery ? `✅ ${alarmName} Recovered` : `🚨 ${alarmName}`,
            description: body,
            color: isRecovery ? 5763719 : 15158332,
            fields: [
              { name: "Server", value: "baity-server", inline: true },
              { name: "Severity", value: severity, inline: true },
              { name: "State", value: state, inline: true }
            ],
            footer: { text: "OCI Monitoring | Cloudflare Worker" }
          }]
        };

        // 3. Hit Discord
        await fetch(webhook, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "User-Agent": "OCI-Alert-Bot" 
          },
          body: JSON.stringify(discordPayload)
        });
      }

      return new Response("OK", { status: 200 });

    } catch (err) {
      return new Response("Error: " + err.message, { status: 500 });
    }
  }
};