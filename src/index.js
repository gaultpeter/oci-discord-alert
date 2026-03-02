export default {
  async fetch(request, env) {
    try {
      const webhook = env.DISCORD_WEBHOOK;
      if (!webhook) {
        return new Response("Webhook not configured", { status: 500 });
      }

      // 1. Handle Confirmation (Oracle handshake)
      const messageType = request.headers.get("x-oci-ns-messagetype");
      const confirmationUrl = request.headers.get("x-oci-ns-confirmationurl");

      if (messageType === "SubscriptionConfirmation" || confirmationUrl) {
        if (confirmationUrl) {
          await fetch(confirmationUrl, { method: "GET" });
          return new Response("Subscription confirmed", { status: 200 });
        }
      }

      const ociPayload = await request.json();

      // 2. Handle Normal Notification
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
        const alarmState = alarmData.state || "FIRING";

        const isRecovery = alarmState.includes("OK");
        const color = isRecovery ? 5763719 : 15158332;

        const discordPayload = {
          embeds: [{
            title: isRecovery ? `✅ ${alarmName} Recovered` : `🚨 ${alarmName}`,
            description: message,
            color: color,
            fields: [
              { name: "Severity", value: severity, inline: true },
              { name: "State", value: alarmState, inline: true }
            ],
            footer: { text: "Oracle Cloud Infrastructure Monitoring" }
          }]
        };

        // Send to Discord with User-Agent
        const res = await fetch(webhook, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "User-Agent": "Cloudflare-Worker-OCI-Alert" 
          },
          body: JSON.stringify(discordPayload)
        });

        console.log(`Discord Response: ${res.status}`);
      }

      return new Response("OK", { status: 200 });

    } catch (err) {
      return new Response("Error: " + err.message, { status: 500 });
    }
  }
};