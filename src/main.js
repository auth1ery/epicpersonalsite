(function () {
  const ID = "1227759305852190801";
  const el = document.getElementById("presence");
  if (!el) return;
  async function poll() {
    try {
      const r = await fetch("https://api.lanyard.rest/v1/users/" + ID);
      const { data } = await r.json();
      const act = data.activities.find((a) => a.type === 0);
      el.dataset.s = data.discord_status;
      el.querySelector(".ptxt").textContent = act
        ? "currently on " + act.name.toLowerCase()
        : data.discord_status;
      el.hidden = false;
    } catch {
      el.hidden = true;
    }
  }
  poll();
  setInterval(poll, 30000);
})();

// this is genuinely just for discord status now