export default {
  async fetch(request, env) {
    try {
      const webhook = env.DISCORD_WEBHOOK;
      if (!webhook) {
        return new Response("Webhook not configured", { status: 500 });
      }

      const ociPayload = await request.json();

      // 🟢 1. Handle OCI Subscription Confirmation
      if (ociPayload.type === "SubscriptionConfirmation") {
        if (ociPayload.confirmationUrl) {
          await fetch(ociPayload.confirmationUrl);
          return new Response("Subscription confirmed", { status: 200 });
        }
      }

      // 🟢 2. Handle Normal Notification
      if (ociPayload.type === "Notification") {

        // OCI wraps the actual alarm inside "message" as JSON string
        let alarmData = {};
        try {
          alarmData = JSON.parse(ociPayload.message);
        } catch {
          alarmData = ociPayload;
        }

        const alarmName = alarmData.title || "OCI Alarm";
        const severity = alarmData.severity || "INFO";
        const message = alarmData.body || "No details provided";
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
            title: isRecovery
              ? `✅ ${alarmName} Recovered`
              : `🚨 ${alarmName}`,
            description: message,
            color: isRecovery ? 5763719 : (colorMap[severity] || 3447003),
            fields: [
              { name: "Severity", value: severity, inline: true },
              { name: "State", value: alarmState, inline: true },
              { name: "Time", value: timestamp, inline: false }
            ],
            footer: {
              text: "Oracle Cloud Infrastructure Monitoring"
            }
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