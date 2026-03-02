export default {
  async fetch(request, env) {
    try {
      const webhook = env.DISCORD_WEBHOOK;
      if (!webhook) {
        console.error("DEBUG: DISCORD_WEBHOOK is missing from Environment Variables.");
        return new Response("Webhook not configured", { status: 500 });
      }

      // 1. Log Headers for Handshake Debugging
      const messageType = request.headers.get("x-oci-ns-messagetype");
      const confirmationUrl = request.headers.get("x-oci-ns-confirmationurl");
      console.log(`DEBUG: Request Type: ${messageType || 'Unknown'}`);

      if (messageType === "SubscriptionConfirmation" || confirmationUrl) {
        if (confirmationUrl) {
          console.log(`DEBUG: Confirming subscription at: ${confirmationUrl}`);
          await fetch(confirmationUrl, { method: "GET" });
          return new Response("Subscription confirmed", { status: 200 });
        }
      }

      // 2. Parse and Log the Payload
      const ociPayload = await request.json();
      console.log("DEBUG: Full OCI Payload received:", JSON.stringify(ociPayload));

      if (ociPayload.type === "Notification") {
        let alarmData = {};
        try {
          // OCI often double-encodes the 'message' field as a string
          if (typeof ociPayload.message === 'string') {
            console.log("DEBUG: message field is a string, parsing JSON...");
            alarmData = JSON.parse(ociPayload.message);
          } else {
            console.log("DEBUG: message field is already an object.");
            alarmData = ociPayload.message;
          }
        } catch (e) {
          console.warn("DEBUG: Could not parse message field as JSON, using raw payload.");
          alarmData = ociPayload;
        }

        console.log("DEBUG: Final Alarm Data for Discord:", JSON.stringify(alarmData));

        const alarmName = alarmData.title || "OCI Alarm";
        const severity = alarmData.severity || "INFO";
        const message = (alarmData.body || "No details provided").substring(0, 1000);
        const alarmState = alarmData.state || "FIRING";
        const isRecovery = alarmState.includes("OK");

        const discordPayload = {
          embeds: [{
            title: isRecovery ? `✅ ${alarmName} Recovered` : `🚨 ${alarmName}`,
            description: message,
            color: isRecovery ? 5763719 : 15158332,
            fields: [
              { name: "Severity", value: severity, inline: true },
              { name: "State", value: alarmState, inline: true }
            ],
            footer: { text: "Oracle Cloud Infrastructure Monitoring" }
          }]
        };

        // 3. Log the Discord Attempt
        console.log("DEBUG: Attempting to hit Discord Webhook...");
        const res = await fetch(webhook, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "User-Agent": "Cloudflare-Worker-OCI-Alert" 
          },
          body: JSON.stringify(discordPayload)
        });

        const resText = await res.text();
        console.log(`DEBUG: Discord Status: ${res.status} ${res.statusText}`);
        console.log(`DEBUG: Discord Response Body: ${resText}`);
        
        if (!res.ok) {
           console.error("DEBUG: Discord failed to accept the message.");
        }
      } else {
        console.log(`DEBUG: Skipping - Payload type "${ociPayload.type}" is not a Notification.`);
      }

      return new Response("OK", { status: 200 });

    } catch (err) {
      console.error("DEBUG: Worker crashed with error:", err.message);
      console.error("DEBUG: Stack trace:", err.stack);
      return new Response("Error: " + err.message, { status: 500 });
    }
  }
};