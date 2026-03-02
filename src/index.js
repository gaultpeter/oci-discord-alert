export default {
  async fetch(request, env) {
    try {
      const webhook = env.DISCORD_WEBHOOK;
      if (!webhook) {
        return new Response("Error: DISCORD_WEBHOOK missing in Cloudflare Settings", { status: 500 });
      }

      // 1. Identify Message Type via Headers (Most Reliable)
      const messageType = request.headers.get("x-oci-ns-messagetype");
      const confirmationUrl = request.headers.get("x-oci-ns-confirmationurl");

      // Handle the Oracle Handshake
      if (messageType === "SubscriptionConfirmation" || confirmationUrl) {
        if (confirmationUrl) await fetch(confirmationUrl);
        return new Response("Handshake Successful", { status: 200 });
      }

      // 2. Parse the Body Safely
      const rawBody = await request.text();
      let ociPayload;
      try {
        ociPayload = JSON.parse(rawBody);
      } catch (e) {
        return new Response("Invalid JSON received", { status: 400 });
      }

      // 3. Process the Notification
      if (messageType === "Notification") {
        // OCI uses "Message" (Upper Case) for the actual alarm data
        const innerMessage = ociPayload.Message || ociPayload.message || "";
        
        let alarmData = {};
        try {
          // Inner message is usually a double-encoded JSON string
          alarmData = typeof innerMessage === 'string' ? JSON.parse(innerMessage) : innerMessage;
        } catch (e) {
          alarmData = { body: innerMessage }; // Fallback if not JSON
        }

        // Safe property access to prevent 500 crashes
        const alarmName = alarmData.title || alarmData.alarmName || "OCI Alert";
        const alarmState = String(alarmData.state || "FIRING");
        const alarmBody = String(alarmData.body || "Memory Utilization Threshold Exceeded");
        const severity = alarmData.severity || "CRITICAL";
        
        const isRecovery = alarmState.toUpperCase().includes("OK");
        const color = isRecovery ? 5763719 : 15158332; // Green : Red

        const discordPayload = {
          embeds: [{
            title: isRecovery ? `✅ ${alarmName} Recovered` : `🚨 ${alarmName}`,
            description: alarmBody,
            color: color,
            fields: [
              { name: "Server", value: "baity-server", inline: true },
              { name: "State", value: alarmState, inline: true },
              { name: "Severity", value: severity, inline: true }
            ],
            footer: { text: "Oracle Cloud Infrastructure Monitoring" }
          }]
        };

        // 4. Send to Discord
        const discordRes = await fetch(webhook, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "User-Agent": "OCI-Discord-Bot" 
          },
          body: JSON.stringify(discordPayload)
        });

        return new Response("Discord Notified", { status: discordRes.status });
      }

      return new Response("Ignored: Not a notification", { status: 200 });

    } catch (err) {
      // This will now catch the error and return it so you can see it in logs
      return new Response(`Worker Error: ${err.message}`, { status: 500 });
    }
  }
};