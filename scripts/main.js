const MODULE_ID = "pf1-skill-request";
const REQUEST_SELECTOR = "a.pf1sr-inline-roll-request";

function localizeSkill(labelOrKey) {
  return game.i18n?.has(labelOrKey) ? game.i18n.localize(labelOrKey) : labelOrKey;
}

function getSkillMap() {
  return CONFIG?.PF1?.skills ?? {};
}

function buildSkillOptions() {
  const skills = getSkillMap();
  return Object.entries(skills)
    .map(([id, label]) => `<option value="${id}">${localizeSkill(label)}</option>`)
    .join("");
}

function openSkillRequestDialog() {
  if (game.system.id !== "pf1") {
    return ui.notifications.warn("Questo modulo è pensato per PF1e.");
  }
  if (!game.user.isGM) {
    return ui.notifications.warn("Solo il GM può inviare richieste di prova.");
  }

  const skills = getSkillMap();
  const skillOptions = buildSkillOptions();

  new Dialog({
    title: "Invia Richiesta Prova Abilità",
    content: `
      <form>
        <div class="form-group">
          <label>Abilità:</label>
          <select id="pf1sr-skill-id">${skillOptions}</select>
        </div>

        <div class="form-group">
          <label>Difficoltà (CD):</label>
          <input type="number" id="pf1sr-dc-value" value="15" min="0" step="1">
        </div>

        <div class="form-group">
          <label>Modalità di tiro:</label>
          <select id="pf1sr-roll-mode">
            <option value="publicroll">Pubblico</option>
            <option value="gmroll">Privato (GM + Giocatore)</option>
            <option value="blindroll">Occulto (Solo GM)</option>
            <option value="selfroll">Solo Giocatore</option>
            <option value="roll">Usa modalità corrente</option>
          </select>
        </div>
      </form>`,
    buttons: {
      send: {
        icon: '<i class="fas fa-check"></i>',
        label: "Invia in Chat",
        callback: async (html) => {
          const skill = html.find("#pf1sr-skill-id").val();
          const skillLabel = localizeSkill(skills[skill] ?? skill);

          const dcRaw = Number.parseInt(html.find("#pf1sr-dc-value").val(), 10);
          const dc = Number.isFinite(dcRaw) ? dcRaw : 15;

          const mode = html.find("#pf1sr-roll-mode").val();

          const labelTesto = (mode === "publicroll")
            ? `Tira ${skillLabel} (CD ${dc})`
            : `Tira ${skillLabel}`;

          const chatContent = `
            <div class="pf1 chat-card">
              <header class="card-header flexrow">
                <h3>Richiesta Prova: ${foundry.utils.escapeHTML(skillLabel)}</h3>
              </header>
              <div class="card-buttons">
                <a class="inline-roll pf1sr-inline-roll-request"
                   style="display:block;text-align:center;line-height:24px;"
                   data-skill="${skill}"
                   data-dc="${dc}"
                   data-mode="${mode}"
                   data-label="${foundry.utils.escapeHTML(skillLabel)}">
                  <i class="fas fa-dice-d20"></i> ${foundry.utils.escapeHTML(labelTesto)}
                </a>
              </div>
            </div>`;

          await ChatMessage.create({ content: chatContent });
        }
      }
    },
    default: "send"
  }).render(true);
}

async function onRequestClick(event) {
  event.preventDefault();

  const el = event.currentTarget;
  const dataset = el.dataset;

  const actor = canvas.tokens.controlled[0]?.actor || game.user.character;
  if (!actor) {
    ui.notifications.warn("Seleziona il tuo token o assegna un personaggio prima di tirare!");
    return;
  }

  const skillKey = dataset.skill;
  const dc = Number.parseInt(dataset.dc, 10);
  const mode = dataset.mode ?? "roll";

  const skillStat = actor.system?.skills?.[skillKey];
  if (!skillStat) {
    ui.notifications.warn(`Skill non trovata sull'attore: ${skillKey}`);
    return;
  }

  const mod = Number(skillStat.mod ?? 0);
  const formula = `1d20 + ${mod}`;

  const r = await (new Roll(formula, actor.getRollData())).evaluate({ async: true });

  const isSuccess = r.total >= dc;
  const margin = r.total - dc;
  const color = isSuccess ? "#2d5a27" : "#5a2727";
  const label = isSuccess ? "Successo" : "Fallimento";
  const sign = margin >= 0 ? "+" : "";

  const title = dataset.label ? dataset.label : skillKey;

  const chatContent = `
    <div class="pf1 chat-card">
      <div class="card-header"><h3>Esito ${foundry.utils.escapeHTML(title)}</h3></div>
      <div class="roll-result">${await r.render()}</div>
      <div class="result-details"
           style="background:${color};color:white;padding:5px;border-radius:3px;text-align:center;font-weight:bold;margin-top:5px;">
        ${label} (${sign}${margin})
        <span style="font-weight:normal;opacity:0.8;margin-left:10px;">CD ${dc}</span>
      </div>
    </div>`;

  // Foundry: ChatMessage usa rolls (array), non roll singolo
  // (il campo roll è deprecato)
  let chatData = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content: chatContent,
    type: CONST.CHAT_MESSAGE_TYPES.ROLL,
    rolls: [r]
  };

  chatData = ChatMessage.applyRollMode(chatData, mode);
  await ChatMessage.create(chatData);
}

// Tool nella barra sinistra (Scene Controls)
Hooks.on("getSceneControlButtons", (controls) => {
  const tokenControls = controls.tokens;
  if (!tokenControls) return;

  const tools = tokenControls.tools;

  tools.pf1SkillRequest = {
    name: "pf1SkillRequest",
    title: "Richiesta Prova Abilità (PF1)",
    icon: "fa-solid fa-dice-d20",
    button: true,
    visible: game.user.isGM,
    order: Object.keys(tools).length,
    onClick: () => openSkillRequestDialog(),
    onChange: () => openSkillRequestDialog()
  };
});

// Hook V13: renderChatMessageHTML (HTMLElement)
Hooks.on("renderChatMessageHTML", (message, html) => {
  const anchors = html.querySelectorAll(REQUEST_SELECTOR);
  for (const a of anchors) {
    if (a.dataset.pf1srBound) continue;
    a.dataset.pf1srBound = "1";
    a.addEventListener("click", onRequestClick);
  }
});

Hooks.once("init", () => {
  game.modules.get(MODULE_ID) && (game[MODULE_ID] = { openSkillRequestDialog });
});
