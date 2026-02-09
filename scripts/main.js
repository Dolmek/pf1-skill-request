const MODULE_ID = "pf1-skill-request";
const DIALOG_APP_ID = "pf1sr-request-dialog";
const REQUEST_SELECTOR = "a.pf1sr-inline-roll-request";

/* -----------------------
 * Utilities
 * --------------------- */

function escapeHtml(s) {
  return foundry.utils.escapeHTML(String(s ?? ""));
}

function localizeMaybe(labelOrKey) {
  return game.i18n?.has(labelOrKey) ? game.i18n.localize(labelOrKey) : labelOrKey;
}

function safeInt(value, fallback = 0) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeRollMode(mode) {
  return mode === "roll" ? game.settings.get("core", "rollMode") : mode;
}

/**
 * Render “compatto” come nella tua seconda immagine:
 * formula a sinistra + totale a destra sulla stessa riga,
 * mantenendo tooltip (click sul totale / comportamento Foundry).
 */
async function renderCompactRollHTML(roll) {
  const tooltip = await roll.getTooltip(); // html string
  return `
    <div class="dice-roll">
      <div class="dice-result">
        <div class="pf1sr-dice-row" style="display:flex; gap:6px; align-items:stretch;">
          <div class="dice-formula" style="flex:1; margin:0;">${escapeHtml(roll.formula)}</div>
          <div class="dice-total" style="margin:0; min-width:3.2em;">${escapeHtml(roll.total)}</div>
        </div>
        <div class="dice-tooltip">${tooltip}</div>
      </div>
    </div>
  `;
}

/* -----------------------
 * PF1 Maps
 * --------------------- */

function getSkillMap() {
  return CONFIG?.PF1?.skills ?? {};
}

function getSaveMap() {
  return { fort: "Tempra", ref: "Riflessi", will: "Volontà" };
}

function getAbilityMap() {
  return {
    str: "Forza",
    dex: "Destrezza",
    con: "Costituzione",
    int: "Intelligenza",
    wis: "Saggezza",
    cha: "Carisma"
  };
}

function buildOptions(map, { localize = false } = {}) {
  return Object.entries(map)
    .map(([id, label]) => {
      const outLabel = localize ? localizeMaybe(label) : label;
      return `<option value="${id}">${outLabel}</option>`;
    })
    .join("");
}

/* -----------------------
 * Dialog (GM)
 * --------------------- */

function openSkillRequestDialog() {
  if (game.system.id !== "pf1") {
    return ui.notifications.warn("Questo modulo è pensato per PF1e.");
  }
  if (!game.user.isGM) {
    return ui.notifications.warn("Solo il GM può inviare richieste di prova.");
  }

  const skills = getSkillMap();
  const saves = getSaveMap();
  const abilities = getAbilityMap();

  const skillOptions = buildOptions(skills, { localize: true });
  const saveOptions = buildOptions(saves);
  const abilityOptions = buildOptions(abilities);

  const content = `
    <form id="${DIALOG_APP_ID}">
      <div class="form-group">
        <label>Tipo prova:</label>
        <select id="pf1sr-kind">
          <option value="skill" selected>Abilità</option>
          <option value="save">Tiro Salvezza</option>
          <option value="ability">Caratteristica</option>
        </select>
      </div>

      <div class="form-group pf1sr-kind-row pf1sr-kind-skill">
        <label>Abilità:</label>
        <select id="pf1sr-skill-id">${skillOptions}</select>
      </div>

      <div class="form-group pf1sr-kind-row pf1sr-kind-save" style="display:none;">
        <label>Tiro Salvezza:</label>
        <select id="pf1sr-save-id">${saveOptions}</select>
      </div>

      <div class="form-group pf1sr-kind-row pf1sr-kind-ability" style="display:none;">
        <label>Caratteristica:</label>
        <select id="pf1sr-ability-id">${abilityOptions}</select>
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
    </form>
  `;

  Hooks.once("renderDialog", (app, html) => {
    const $kind = html.find("#pf1sr-kind");
    const $rowSkill = html.find(".pf1sr-kind-skill");
    const $rowSave = html.find(".pf1sr-kind-save");
    const $rowAbility = html.find(".pf1sr-kind-ability");

    const refresh = () => {
      const kind = $kind.val();
      $rowSkill.toggle(kind === "skill");
      $rowSave.toggle(kind === "save");
      $rowAbility.toggle(kind === "ability");
    };

    $kind.on("change", refresh);
    refresh();
  });

  new Dialog(
    {
      title: "Invia Richiesta Prova",
      content,
      buttons: {
        send: {
          icon: '<i class="fas fa-check"></i>',
          label: "Invia in Chat",
          callback: async (html) => {
            const kind = html.find("#pf1sr-kind").val();
            const dc = safeInt(html.find("#pf1sr-dc-value").val(), 15);
            const mode = html.find("#pf1sr-roll-mode").val();

            let key;
            let label;

            if (kind === "save") {
              key = html.find("#pf1sr-save-id").val();
              label = saves[key] ?? key;
            } else if (kind === "ability") {
              key = html.find("#pf1sr-ability-id").val();
              label = abilities[key] ?? key;
            } else {
              key = html.find("#pf1sr-skill-id").val();
              label = localizeMaybe(skills[key] ?? key);
            }

            const labelText =
              mode === "publicroll" ? `Tira ${label} (CD ${dc})` : `Tira ${label}`;

            const header =
              kind === "save"
                ? `Richiesta TS: ${label}`
                : kind === "ability"
                  ? `Richiesta Caratt.: ${label}`
                  : `Richiesta Prova: ${label}`;

            const chatContent = `
              <div class="pf1 chat-card">
                <header class="card-header flexrow">
                  <h3>${escapeHtml(header)}</h3>
                </header>
                <div class="card-buttons">
                  <a class="inline-roll pf1sr-inline-roll-request"
                     style="display:block;text-align:center;line-height:24px;"
                     data-kind="${escapeHtml(kind)}"
                     data-key="${escapeHtml(key)}"
                     data-dc="${dc}"
                     data-mode="${escapeHtml(mode)}"
                     data-label="${escapeHtml(label)}">
                    <i class="fas fa-dice-d20"></i> ${escapeHtml(labelText)}
                  </a>
                </div>
              </div>`;

            await ChatMessage.create({ content: chatContent });
          }
        }
      },
      default: "send"
    },
    { id: DIALOG_APP_ID }
  ).render(true);
}

/* -----------------------
 * Roll execution (system-first, fallback)
 * --------------------- */

function extractRollFromUnknown(result) {
  if (!result) return null;
  if (result instanceof Roll) return result;

  if (result instanceof ChatMessage) return result.rolls?.[0] ?? null;

  if (result.roll instanceof Roll) return result.roll;
  if (Array.isArray(result.rolls) && result.rolls[0] instanceof Roll) return result.rolls[0];
  if (result.message instanceof ChatMessage) return result.message.rolls?.[0] ?? null;

  const maybe = result?.data?.roll ?? result?.data?.rolls?.[0];
  return maybe instanceof Roll ? maybe : null;
}

async function systemRoll(actor, kind, key, rollMode) {
  const opts = {
    skipDialog: true,
    chatMessage: false,
    rollMode: normalizeRollMode(rollMode)
  };

  try {
    if (kind === "skill" && typeof actor.rollSkill === "function") {
      const res = await actor.rollSkill(key, opts);
      return extractRollFromUnknown(res);
    }
    if (kind === "save" && typeof actor.rollSavingThrow === "function") {
      const res = await actor.rollSavingThrow(key, opts);
      return extractRollFromUnknown(res);
    }
    if (kind === "ability" && typeof actor.rollAbilityTest === "function") {
      const res = await actor.rollAbilityTest(key, opts);
      return extractRollFromUnknown(res);
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | systemRoll failed`, err);
  }
  return null;
}

async function fallbackRoll(actor, kind, key) {
  let mod = 0;

  if (kind === "skill") {
    mod = Number(actor.system?.skills?.[key]?.mod ?? 0);
  } else if (kind === "ability") {
    mod = Number(actor.system?.abilities?.[key]?.mod ?? 0);
  } else if (kind === "save") {
    const candidates = [
      actor.system?.attributes?.savingThrows?.[key]?.total,
      actor.system?.attributes?.savingThrows?.[key]?.value,
      actor.system?.saves?.[key]?.total,
      actor.system?.saves?.[key]?.mod,
      actor.system?.attributes?.saves?.[key]?.total,
      actor.system?.attributes?.saves?.[key]?.value
    ];
    const found = candidates.find((v) => Number.isFinite(Number(v)));
    mod = Number(found ?? 0);
  }

  const formula = `1d20 + ${mod}`;
  return await new Roll(formula, actor.getRollData()).evaluate({ async: true });
}

/* -----------------------
 * Chat click handler
 * --------------------- */

async function onRequestClick(event) {
  event.preventDefault();

  const el = event.currentTarget;
  const dataset = el.dataset;

  const actor = canvas.tokens.controlled[0]?.actor || game.user.character;
  if (!actor) {
    ui.notifications.warn("Seleziona il tuo token o assegna un personaggio prima di tirare!");
    return;
  }

  // Retrocompatibilità: vecchi bottoni con data-skill
  const kind = dataset.kind ?? (dataset.skill ? "skill" : "skill");
  const key = dataset.key ?? dataset.skill;
  const dc = safeInt(dataset.dc, 0);
  const mode = dataset.mode ?? "roll";
  const label = dataset.label ?? key;

  if (!key) {
    ui.notifications.warn("Richiesta non valida: manca la chiave del tiro (data-key / data-skill).");
    return;
  }

  let r = await systemRoll(actor, kind, key, mode);
  if (!r) r = await fallbackRoll(actor, kind, key);

  const isSuccess = r.total >= dc;
  const margin = r.total - dc;
  const increments = Math.floor(Math.abs(margin) / 5); // Calcolo del valore [X]: quante volte il 5 sta nel margine (indipendentemente dal segno)
  const color = isSuccess ? "#2d5a27" : "#5a2727";
  const outcome = isSuccess ? "Successo" : "Fallimento";
  const sign = margin >= 0 ? "+" : "";

  const prefix = kind === "save" ? "TS" : kind === "ability" ? "Caratt." : "Prova";

  // roll “compatto”
  const rollHtml = await renderCompactRollHTML(r);

  const chatContent = `
    <div class="pf1 chat-card">
      <div class="card-header">
        <h3>Esito ${escapeHtml(prefix)} ${escapeHtml(label)} CD ${dc}</h3>
      </div>
      <div class="roll-result">${rollHtml}</div>
      <div class="result-details"
           style="background:${color};color:white;padding:5px;border-radius:3px;text-align:center;font-weight:normal;margin-top:5px;">
        CD ${dc} 
        <span style="font-weight:bold;font-size:0.8rem;">${outcome} (${sign}${margin})</span>
        <span style="font-weight:bold;font-size:0.8rem;">Incrementi (${increments})</span>
        
      </div>
    </div>`;

  let chatData = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content: chatContent,
    type: CONST.CHAT_MESSAGE_TYPES.ROLL,
    rolls: [r]
  };

  chatData = ChatMessage.applyRollMode(chatData, mode);
  await ChatMessage.create(chatData);
}

/* -----------------------
 * Scene Controls (V13) - CONTROLLO TOP-LEVEL (non figlio di Tokens)
 * --------------------- */

Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user.isGM) return;

  // evita duplicati (può succedere su re-render multipli)
  if (controls.pf1sr) return;

const tokenControls = controls.tokens;
  if (!tokenControls) return;

  const tools = tokenControls.tools;

  tools.pf1SkillRequest = {
    name: "pf1SkillRequest",
    title: "Richiesta Prova (PF1)",
    icon: "fa-solid fa-dice-d20",
    button: true,
    visible: game.user.isGM,
    order: Object.keys(tools).length,
    onClick: () => openSkillRequestDialog()
  };
});

/* -----------------------
 * Bind chat buttons (V13)
 * --------------------- */

Hooks.on("renderChatMessageHTML", (message, html) => {
  const anchors = html.querySelectorAll(REQUEST_SELECTOR);
  for (const a of anchors) {
    if (a.dataset.pf1srBound) continue;
    a.dataset.pf1srBound = "1";
    a.addEventListener("click", onRequestClick);
  }
});

/* -----------------------
 * Module API
 * --------------------- */

Hooks.once("init", () => {
  if (game.modules.get(MODULE_ID)) {
    game[MODULE_ID] = { openSkillRequestDialog };
  }
});
