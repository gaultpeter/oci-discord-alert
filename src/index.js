export default {
  async fetch(request, env) {
    try {
      const webhook = env.DISCORD_WEBHOOK;
      if (!webhook) {
        return new Response("Webhook not configured", { status: 500 });
      }

      // 1. Check if it's a confirmation request via headers (faster)
      const messageType = request.headers.get("x-oci-ns-messagetype");
      const confirmationUrl = request.headers.get("x-oci-ns-confirmationurl");

      if (messageType === "SubscriptionConfirmation" || confirmationUrl) {
        const targetUrl = confirmationUrl; 
        if (targetUrl) {
          // Trigger the GET request to Oracle's confirmation endpoint
          await fetch(targetUrl, { method: "GET" });
          console.log("Confirmed via Header URL:", targetUrl);
          return new Response("Subscription confirmed", { status: 200 });
        }
      }

      const ociPayload = await request.json();

      // 2. Fallback: Handle confirmation via JSON body
      if (ociPayload.type === "SubscriptionConfirmation") {
        if (ociPayload.confirmationUrl) {
          await fetch(ociPayload.confirmationUrl, { method: "GET" });
          return new Response("Subscription confirmed", { status: 200 });
        }
      }

      // 3. Handle Normal Notification
      if (ociPayload.type === "Notification") {
        let alarmData = {};
        try {
          alarmData = typeof ociPayload.message === 'string' 
            ? JSON.parse(ociPayload.message) 
            : ociPayload.message;
        } catch {
          alarmData = ociPayload;
        }

        const alarmName = alarmData.title || "OCI Alarm";
        const severity = alarmData.severity || "INFO";
        const message = (alarmData.body || "No details provided").substring(0, 1000);
        const timestamp = alarmData.timestamp || new Date().toISOString();
        const alarmState = alarmData.state || "FIRING";

        const colorMap = {
          CRITICAL: 15158332,
          ERROR: 15105570,
          WARNING: 16776960,
          INFO: 3447003
        };

        const isRecovery = alarmState.includes("OK");

        const discordPayload = {
          embeds: [{
            title: isRecovery ? `✅ ${alarmName} Recovered` : `🚨 ${alarmName}`,
            description: message,
            color: isRecovery ? 5763719 : (colorMap[severity] || 3447003),
            fields: [
              { name: "Severity", value: severity, inline: true },
              { name: "State", value: alarmState, inline: true },
              { name: "Time", value: timestamp, inline: false }
            ],
            footer: { text: "Oracle Cloud Infrastructure Monitoring" }
          }]
        };

        await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(discordPayload)
        });
      }

      return new Response("OK", { status: 200 });

    } catch (err) {
      return new Response("Error: " + err.message, { status: 500 });
    }
  }
};