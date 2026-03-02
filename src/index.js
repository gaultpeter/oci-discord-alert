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

      // 2. Logic: Trigger if it's an Alarm State Change or Notification
      const isAlarm = ociPayload.alarmMetaData || ociPayload.type?.includes("_TO_");
      const isNotification = ociPayload.type === "Notification";

      if (isAlarm || isNotification) {
        let title = ociPayload.title || "OCI Alarm";
        let state = ociPayload.type || "UNKNOWN";
        let severity = ociPayload.severity || "INFO";
        let displayBody = "";

        // 3. Clean up the Body Text
        if (ociPayload.alarmMetaData && ociPayload.alarmMetaData[0]) {
          const meta = ociPayload.alarmMetaData[0];
          state = meta.status || state;
          
          // Extract the raw percentage (e.g., "78.52")
          const rawMetric = meta.metricValues?.[0] ? Object.values(meta.metricValues[0])[0] : null;

          if (state === "OK") {
            displayBody = "✅ **Memory usage has returned to normal.**";
          } else {
            displayBody = `🚨 **High memory spike detected.**\n**Usage:** \`${rawMetric}%\` (Peak)`;
          }
        } else {
          // Fallback for simple notifications
          displayBody = typeof ociPayload.message === 'string' ? ociPayload.message : "Threshold reached.";
        }

        const isRecovery = state.includes("OK");
        const color = isRecovery ? 5763719 : 15158332; // Green : Red

        const discordPayload = {
          embeds: [{
            title: isRecovery ? `✅ Memory Healthy` : `🚨 High Memory Usage`,
            description: displayBody,
            color: color,
            fields: [
              { name: "Server", value: "baity-server", inline: true },
              { name: "Severity", value: severity, inline: true },
              { name: "State", value: state, inline: true }
            ],
            footer: { text: "OCI Monitoring | Valheim Server" },
            timestamp: new Date().toISOString()
          }]
        };

        await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(discordPayload)
        });
        
        console.log("Discord notified successfully.");
      }

      return new Response("OK", { status: 200 });
    } catch (err) {
      console.error("Worker Error:", err.message);
      return new Response(err.message, { status: 500 });
    }
  }
};