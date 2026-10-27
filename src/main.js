(function () {
  const ID = "1227759305852190801";
  const el = document.getElementById("presence");
  if (!el) return;

  const STATUS = {
    online: "online",
    idle: "away",
    dnd: "busy, do not disturb",
    offline: "offline",
  };

  function describe(data) {
    const acts = data.activities || [];

    if (data.listening_to_spotify && data.spotify) {
      const { song, artist } = data.spotify;
      return "listening to " + song + " by " + artist.split(";")[0];
    }

    const game = acts.find((a) => a.type === 0);
    if (game) {
      let out = "playing " + game.name;
      if (game.details) out += ": " + game.details;
      if (game.state) out += " (" + game.state + ")";
      return out;
    }

    const stream = acts.find((a) => a.type === 1);
    if (stream) {
      return "streaming " + (stream.details || stream.name);
    }

    const watch = acts.find((a) => a.type === 3);
    if (watch) {
      return (
        "watching " + watch.name + (watch.details ? ": " + watch.details : "")
      );
    }

    const compete = acts.find((a) => a.type === 5);
    if (compete) return "competing in " + compete.name;

    const custom = acts.find((a) => a.type === 4);
    if (custom && custom.state) {
      return (
        (custom.emoji && custom.emoji.name ? custom.emoji.name + " " : "") +
        custom.state
      );
    }

    return STATUS[data.discord_status] || data.discord_status;
  }

  async function poll() {
    try {
      const r = await fetch("https://api.lanyard.rest/v1/users/" + ID);
      const { data } = await r.json();
      const text = describe(data);
      el.dataset.s = data.discord_status;
      const label = el.querySelector(".ptxt");
      label.textContent = text;
      el.title = text;
      el.hidden = false;
    } catch {
      el.hidden = true;
    }
  }

  poll();
  setInterval(poll, 30000);
})();

// this is genuinely just for discord status now
