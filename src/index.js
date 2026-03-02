export default {
  async fetch(request, env) {
    try {
      const webhook = env.DISCORD_WEBHOOK;
      if (!webhook) return new Response("Webhook missing", { status: 500 });

      // 1. Handle Handshake
      const messageType = request.headers.get("x-oci-ns-messagetype");
      const confirmationUrl = request.headers.get("x-oci-ns-confirmationurl");
      if (confirmationUrl) {
        await fetch(confirmationUrl);
        return new Response("Confirmed", { status: 200 });
      }

      const ociPayload = await request.json();
      console.log("Processing Payload Type:", ociPayload.type);

      // 2. The Logic: Trigger if it's a Notification OR an Alarm State Change
      const isAlarm = ociPayload.alarmMetaData || ociPayload.type?.includes("_TO_");
      const isNotification = ociPayload.type === "Notification";

      if (isAlarm || isNotification) {
        let title = ociPayload.title || "OCI Alarm";
        let body = "No details";
        let state = ociPayload.type || "UNKNOWN";
        let severity = ociPayload.severity || "INFO";

        // Extract detailed info from alarmMetaData if it exists (your log format)
        if (ociPayload.alarmMetaData && ociPayload.alarmMetaData[0]) {
          const meta = ociPayload.alarmMetaData[0];
          body = meta.alarmSummary || body;
          state = meta.status || state;
          
          // Capture the exact memory value (78.52%)
          if (meta.metricValues && meta.metricValues[0]) {
             const metricEntry = Object.entries(meta.metricValues[0])[0];
             if (metricEntry) body += `\n**Current Value:** ${metricEntry[1]}%`;
          }
        } else if (ociPayload.message) {
           // Fallback for standard notifications
           body = typeof ociPayload.message === 'string' ? ociPayload.message : JSON.stringify(ociPayload.message);
        }

        const isRecovery = state.includes("OK");
        const color = isRecovery ? 5763719 : 15158332;

        const discordPayload = {
          embeds: [{
            title: isRecovery ? `✅ ${title} Recovered` : `🚨 ${title}`,
            description: body,
            color: color,
            fields: [
              { name: "Server", value: "baity-server", inline: true },
              { name: "Severity", value: severity, inline: true },
              { name: "State", value: state, inline: true }
            ],
            footer: { text: "OCI Monitoring | Valheim Server" }
          }]
        };

        await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(discordPayload)
        });
        
        console.log("Discord notified successfully.");
      } else {
        console.log(`Skipping unknown type: ${ociPayload.type}`);
      }

      return new Response("OK", { status: 200 });
    } catch (err) {
      console.error("Worker Error:", err.message);
      return new Response(err.message, { status: 500 });
    }
  }
};