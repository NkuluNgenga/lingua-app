// ==========================================
// ESTADO GLOBAL EN MEMORIA (Ultraligero)
// ==========================================
const AppState = {
  currentText: null,
  deck: [],
  selectedToken: null,
  // Cola de repaso activa de la sesión
  reviewQueue: [],
  currentCardIndex: -1
};

const STORAGE_KEYS = {
  TEXT: 'lingua_current_text',
  DECK: 'lingua_deck'
};

// ==========================================
// CAPA DE PERSISTENCIA (localStorage)
// ==========================================
const Storage = {
  loadData() {
    try {
      const savedText = localStorage.getItem(STORAGE_KEYS.TEXT);
      const savedDeck = localStorage.getItem(STORAGE_KEYS.DECK);

      if (savedText) AppState.currentText = JSON.parse(savedText);
      if (savedDeck) AppState.deck = JSON.parse(savedDeck);
    } catch (e) {
      console.error('Error cargando localStorage:', e);
      AppState.deck = [];
    }
  },

  saveCurrentText(textData) {
    AppState.currentText = textData;
    localStorage.setItem(STORAGE_KEYS.TEXT, JSON.stringify(textData));
  },

  saveDeck() {
    localStorage.setItem(STORAGE_KEYS.DECK, JSON.stringify(AppState.deck));
    UI.updateStats();
  }
};

// ==========================================
// MOTOR MATEMÁTICO SRS (SM-2 Adaptativo)
// ==========================================
const SRSAlgorithm = {
  // Mapeo de botones a escala de calidad (2 a 5)
  QUALITY_MAP: {
    again: 2,
    hard: 3,
    good: 4,
    easy: 5
  },

  calculateNextReview(card, ratingKey) {
    const quality = this.QUALITY_MAP[ratingKey] || 4;
    let { interval, repetitions, easeFactor } = card;

    // Inicialización de valores por defecto si no existen
    interval = interval || 0;
    repetitions = repetitions || 0;
    easeFactor = easeFactor || 2.5;

    if (quality < 3) {
      // Fallo (Again): Reinicio de racha
      repetitions = 0;
      interval = 1;
    } else {
      // Éxito: Progresión geométrica de intervalos
      if (repetitions === 0) {
        interval = (quality === 5) ? 4 : 1;
      } else if (repetitions === 1) {
        interval = (quality === 5) ? 7 : 4;
      } else {
        if (quality === 3) {
          interval = Math.round(interval * 1.2);
        } else if (quality === 4) {
          interval = Math.round(interval * easeFactor);
        } else {
          interval = Math.round(interval * easeFactor * 1.3);
        }
      }
      repetitions++;
    }

    // Actualización del Ease Factor (mínimo 1.3)
    easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (easeFactor < 1.3) easeFactor = 1.3;

    // Cálculo de la fecha objetivo en formato YYYY-MM-DD
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + interval);
    const dueDate = targetDate.toISOString().split('T')[0];

    return {
      ...card,
      interval,
      repetitions,
      easeFactor: Number(easeFactor.toFixed(2)),
      dueDate
    };
  }
};

// ==========================================
// MÓDULO: REPASO SRS (Fase 4)
// ==========================================
const ReviewModule = {
  init() {
    const btnShowAnswer = document.getElementById('btn-show-answer');
    const ratingButtons = document.getElementById('srs-rating-buttons');

    // Botón para revelar respuesta (reverso de tarjeta)
    btnShowAnswer.addEventListener('click', () => {
      document.getElementById('card-back-side').classList.remove('hidden');
      btnShowAnswer.classList.add('hidden');
      ratingButtons.classList.remove('hidden');
    });

    // Delegación de eventos para los 4 botones de calificación
    ratingButtons.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-rating');
      if (!btn) return;

      const rating = btn.dataset.rating;
      this.rateCurrentCard(rating);
    });
  },

  startSession() {
    const today = new Date().toISOString().split('T')[0];
    
    // Filtramos tarjetas cuya fecha de repaso sea hoy o anterior
    AppState.reviewQueue = AppState.deck.filter(card => !card.dueDate || card.dueDate <= today);
    AppState.currentCardIndex = 0;

    this.renderCurrentCard();
  },

  renderCurrentCard() {
    const cardCounter = document.getElementById('card-index');
    const cardTotal = document.getElementById('card-total');
    const frontText = document.getElementById('card-front-text');
    const hintText = document.getElementById('card-hint-text');
    const backText = document.getElementById('card-back-text');
    const backSide = document.getElementById('card-back-side');
    const btnShowAnswer = document.getElementById('btn-show-answer');
    const ratingButtons = document.getElementById('srs-rating-buttons');

    // Ocultar siempre la respuesta y reiniciar visibilidad de botones
    backSide.classList.add('hidden');
    ratingButtons.classList.add('hidden');

    if (AppState.reviewQueue.length === 0 || AppState.currentCardIndex >= AppState.reviewQueue.length) {
      // Fin de la sesión o sin tarjetas pendientes
      cardCounter.textContent = '0';
      cardTotal.textContent = '0';
      frontText.textContent = '🎉 ¡Al día!';
      hintText.textContent = 'No hay repasos pendientes programados para hoy.';
      backText.textContent = '';
      btnShowAnswer.classList.add('hidden');
      return;
    }

    const currentCard = AppState.reviewQueue[AppState.currentCardIndex];

    cardCounter.textContent = AppState.currentCardIndex + 1;
    cardTotal.textContent = AppState.reviewQueue.length;
    frontText.textContent = currentCard.front;
    hintText.textContent = currentCard.hint || '';
    backText.textContent = currentCard.back;

    btnShowAnswer.classList.remove('hidden');
  },

  rateCurrentCard(ratingKey) {
    const currentCard = AppState.reviewQueue[AppState.currentCardIndex];
    if (!currentCard) return;

    // Calcular nuevos parámetros con SM-2
    const updatedCard = SRSAlgorithm.calculateNextReview(currentCard, ratingKey);

    // Actualizar la tarjeta en el mazo principal
    const deckIndex = AppState.deck.findIndex(c => c.id === currentCard.id);
    if (deckIndex !== -1) {
      AppState.deck[deckIndex] = updatedCard;
      Storage.saveDeck();
    }

    // Avanzar a la siguiente tarjeta de la cola
    AppState.currentCardIndex++;
    this.renderCurrentCard();
  }
};

// ==========================================
// MANIPULACIÓN DEL DOM / VISTAS
// ==========================================
const UI = {
  initTabs() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const views = document.querySelectorAll('.view');

    navButtons.forEach(button => {
      button.addEventListener('click', () => {
        const targetId = button.getAttribute('data-target');

        navButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        views.forEach(view => {
          const isActive = view.id === targetId;
          view.classList.toggle('active', isActive);

          // Si el usuario entra a la pestaña de repaso, inicia/refresca la sesión
          if (isActive && targetId === 'view-review') {
            ReviewModule.startSession();
          }
        });
      });
    });
  },

  renderText(textData) {
    const titleEl = document.getElementById('reader-title');
    const contentEl = document.getElementById('reader-content');

    if (!textData || !textData.tokens) {
      titleEl.textContent = 'Sin lectura cargada';
      contentEl.innerHTML = '<p class="placeholder-text">Carga un archivo .json para comenzar.</p>';
      return;
    }

    titleEl.textContent = textData.title || 'Lectura';

    const fragment = document.createDocumentFragment();
    textData.tokens.forEach((token, index) => {
      const span = document.createElement('span');
      span.textContent = token.w + ' ';
      span.className = 'token';
      span.dataset.index = index;
      fragment.appendChild(span);
    });

    contentEl.innerHTML = '';
    contentEl.appendChild(fragment);
  },

  updateStats() {
    const badgeCount = document.getElementById('due-count');
    if (!badgeCount) return;

    const today = new Date().toISOString().split('T')[0];
    const dueCards = AppState.deck.filter(card => !card.dueDate || card.dueDate <= today);
    badgeCount.textContent = dueCards.length;
  }
};

// ==========================================
// MÓDULO: LECTOR CONTEXTUAL
// ==========================================
const ReaderModule = {
  init() {
    const contentEl = document.getElementById('reader-content');
    const glossPanel = document.getElementById('gloss-panel');
    const wordEl = document.getElementById('gloss-word');
    const phoneticEl = document.getElementById('gloss-phonetic');
    const defEl = document.getElementById('gloss-definition');
    const btnAddDeck = document.getElementById('btn-add-deck');

    contentEl.addEventListener('click', (e) => {
      const tokenSpan = e.target.closest('.token');
      if (!tokenSpan || !AppState.currentText) return;

      const tokenIndex = parseInt(tokenSpan.dataset.index, 10);
      const tokenData = AppState.currentText.tokens[tokenIndex];
      if (!tokenData) return;

      document.querySelectorAll('.token.selected').forEach(el => el.classList.remove('selected'));
      tokenSpan.classList.add('selected');

      AppState.selectedToken = tokenData;

      const cleanFront = tokenData.w.replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, '').trim();

      wordEl.textContent = cleanFront || tokenData.w;
      phoneticEl.textContent = tokenData.p || '';
      defEl.textContent = tokenData.t || 'Sin traducción disponible';

      const isAlreadySaved = AppState.deck.some(card => card.front.toLowerCase() === (cleanFront || tokenData.w).toLowerCase());
      if (isAlreadySaved) {
        btnAddDeck.textContent = '✓ En Repaso';
        btnAddDeck.disabled = true;
        btnAddDeck.classList.add('btn-disabled');
      } else {
        btnAddDeck.textContent = 'Añadir a Repaso';
        btnAddDeck.disabled = false;
        btnAddDeck.classList.remove('btn-disabled');
      }

      glossPanel.classList.remove('hidden');
    });

    btnAddDeck.addEventListener('click', () => {
      if (!AppState.selectedToken) return;

      const cleanFront = AppState.selectedToken.w.replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, '').trim() || AppState.selectedToken.w;

      const newCard = {
        id: 'card_' + Date.now(),
        front: cleanFront,
        back: AppState.selectedToken.t,
        hint: AppState.selectedToken.p || '',
        interval: 0,
        repetitions: 0,
        easeFactor: 2.5,
        dueDate: new Date().toISOString().split('T')[0]
      };

      AppState.deck.push(newCard);
      Storage.saveDeck();

      btnAddDeck.textContent = '✓ Guardada';
      btnAddDeck.disabled = true;
      btnAddDeck.classList.add('btn-disabled');
    });
  }
};

// ==========================================
// IMPORTACIÓN DE ARCHIVOS
// ==========================================
function initFileImporter() {
  const fileInput = document.getElementById('file-import');

  fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target.result);

        if (!importedData.tokens || !Array.isArray(importedData.tokens)) {
          alert('El archivo JSON no tiene la estructura requerida (debe contener "tokens").');
          return;
        }

        document.getElementById('gloss-panel').classList.add('hidden');
        AppState.selectedToken = null;

        Storage.saveCurrentText(importedData);
        UI.renderText(importedData);
      } catch (err) {
        alert('Archivo JSON inválido.');
        console.error(err);
      }
    };

    reader.readAsText(file);
    fileInput.value = '';
  });
}

// ==========================================
// PUNTO DE ENTRADA (BOOTSTRAP)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  Storage.loadData();
  UI.initTabs();
  initFileImporter();
  ReaderModule.init();
  ReviewModule.init();

  if (AppState.currentText) {
    UI.renderText(AppState.currentText);
  }

  UI.updateStats();
});