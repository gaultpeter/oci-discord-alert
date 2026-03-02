export default {
  async fetch(request) {
    try {
      const webhook = DISCORD_WEBHOOK; // set as secret in Cloudflare

      const ociPayload = await request.json();

      const alarmName = ociPayload.title || "OCI Alarm";
      const severity = ociPayload.severity || "INFO";
      const message = ociPayload.body || "No details provided";
      const timestamp = ociPayload.timestamp || new Date().toISOString();
      const alarmState = ociPayload.type || "FIRING";

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

      return new Response("OK", { status: 200 });

    } catch (err) {
      return new Response("Error: " + err.message, { status: 500 });
    }
  }
};