// ==========================================
// ESTADO GLOBAL EN MEMORIA
// ==========================================
const AppState = {
  library: [],            // Lista con todos los textos disponibles
  currentTextId: null,    // ID del texto seleccionado actualmente
  deck: [],               // Mazo SRS
  selectedToken: null,
  reviewQueue: [],
  currentCardIndex: -1
};

const STORAGE_KEYS = {
  LIBRARY: 'lingua_library',
  CURRENT_ID: 'lingua_current_text_id',
  DECK: 'lingua_deck'
};

// ==========================================
// CAPA DE PERSISTENCIA (localStorage)
// ==========================================
const Storage = {
  loadData() {
    try {
      const savedLibrary = localStorage.getItem(STORAGE_KEYS.LIBRARY);
      const savedCurrentId = localStorage.getItem(STORAGE_KEYS.CURRENT_ID);
      const savedDeck = localStorage.getItem(STORAGE_KEYS.DECK);

      if (savedLibrary) AppState.library = JSON.parse(savedLibrary);
      if (savedCurrentId) AppState.currentTextId = savedCurrentId;
      if (savedDeck) AppState.deck = JSON.parse(savedDeck);
    } catch (e) {
      console.error('Error cargando almacenamiento:', e);
      AppState.library = [];
      AppState.deck = [];
    }
  },

  saveLibrary() {
    localStorage.setItem(STORAGE_KEYS.LIBRARY, JSON.stringify(AppState.library));
    localStorage.setItem(STORAGE_KEYS.CURRENT_ID, AppState.currentTextId || '');
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
  QUALITY_MAP: { again: 2, hard: 3, good: 4, easy: 5 },

  calculateNextReview(card, ratingKey) {
    const quality = this.QUALITY_MAP[ratingKey] || 4;
    let { interval, repetitions, easeFactor } = card;

    interval = interval || 0;
    repetitions = repetitions || 0;
    easeFactor = easeFactor || 2.5;

    if (quality < 3) {
      repetitions = 0;
      interval = 1;
    } else {
      if (repetitions === 0) {
        interval = (quality === 5) ? 4 : 1;
      } else if (repetitions === 1) {
        interval = (quality === 5) ? 7 : 4;
      } else {
        if (quality === 3) interval = Math.round(interval * 1.2);
        else if (quality === 4) interval = Math.round(interval * easeFactor);
        else interval = Math.round(interval * easeFactor * 1.3);
      }
      repetitions++;
    }

    easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (easeFactor < 1.3) easeFactor = 1.3;

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
// MÓDULO: BIBLIOTECA DE LECTURAS
// ==========================================
const LibraryModule = {
  init() {
    const fileInput = document.getElementById('file-import');
    const btnOpenPaste = document.getElementById('btn-open-paste-modal');
    const pasteModal = document.getElementById('paste-modal');
    const btnCancelPaste = document.getElementById('btn-cancel-paste');
    const btnConfirmPaste = document.getElementById('btn-confirm-paste');
    const pasteInput = document.getElementById('paste-json-input');

    // Importación vía archivo .json
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const parsed = JSON.parse(evt.target.result);
          LibraryModule.addText(parsed);
        } catch (err) {
          alert('El archivo no es un JSON válido.');
        }
      };
      reader.readAsText(file);
      fileInput.value = '';
    });

    // Control del modal de pegado
    btnOpenPaste.addEventListener('click', () => {
      pasteInput.value = '';
      pasteModal.classList.remove('hidden');
    });

    btnCancelPaste.addEventListener('click', () => {
      pasteModal.classList.add('hidden');
    });

    btnConfirmPaste.addEventListener('click', () => {
      const rawText = pasteInput.value.trim();
      if (!rawText) return;

      try {
        const parsed = JSON.parse(rawText);
        LibraryModule.addText(parsed);
        pasteModal.classList.add('hidden');
      } catch (err) {
        alert('Texto JSON inválido. Verifica el formato e intenta nuevamente.');
      }
    });

    // Delegación de eventos en la lista de textos (seleccionar o eliminar)
    const libraryList = document.getElementById('library-list');
    libraryList.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('.btn-delete-text');
      const itemInfo = e.target.closest('.library-item-info');

      if (deleteBtn) {
        const textId = deleteBtn.dataset.id;
        LibraryModule.deleteText(textId);
        return;
      }

      if (itemInfo) {
        const textId = itemInfo.dataset.id;
        LibraryModule.selectText(textId);
        UI.switchTab('view-reader');
      }
    });

    // Botón para volver desde el lector a la biblioteca
    document.getElementById('btn-back-to-library').addEventListener('click', () => {
      UI.switchTab('view-library');
    });
  },

  addText(data) {
    if (!data.tokens || !Array.isArray(data.tokens) || data.tokens.length === 0) {
      alert('Estructura inválida: debe incluir un arreglo "tokens".');
      return;
    }

    const newText = {
      id: data.id || 'text_' + Date.now(),
      title: data.title || 'Lectura sin título',
      tokens: data.tokens,
      wordCount: data.tokens.length,
      createdAt: new Date().toLocaleDateString()
    };

    // Si ya existe un texto con el mismo ID, lo reemplaza; si no, lo agrega al inicio
    const existingIndex = AppState.library.findIndex(t => t.id === newText.id);
    if (existingIndex !== -1) {
      AppState.library[existingIndex] = newText;
    } else {
      AppState.library.unshift(newText);
    }

    AppState.currentTextId = newText.id;
    Storage.saveLibrary();
    this.render();
    ReaderModule.loadCurrentText();
  },

  deleteText(id) {
    if (!confirm('¿Deseas eliminar esta lectura de tu biblioteca?')) return;

    AppState.library = AppState.library.filter(t => t.id !== id);
    if (AppState.currentTextId === id) {
      AppState.currentTextId = AppState.library.length > 0 ? AppState.library[0].id : null;
    }

    Storage.saveLibrary();
    this.render();
    ReaderModule.loadCurrentText();
  },

  selectText(id) {
    AppState.currentTextId = id;
    Storage.saveLibrary();
    this.render();
    ReaderModule.loadCurrentText();
  },

  render() {
    const listEl = document.getElementById('library-list');
    listEl.innerHTML = '';

    if (AppState.library.length === 0) {
      listEl.innerHTML = '<p class="placeholder-text">Aún no hay lecturas guardadas. Importa un archivo o pega un JSON para empezar.</p>';
      return;
    }

    const fragment = document.createDocumentFragment();
    AppState.library.forEach(text => {
      const card = document.createElement('div');
      card.className = 'library-item' + (text.id === AppState.currentTextId ? ' current' : '');
      
      card.innerHTML = `
        <div class="library-item-info" data-id="${text.id}">
          <div class="library-item-title">${text.title}</div>
          <div class="library-item-meta">${text.wordCount} palabras • ${text.createdAt || 'Guardado'}</div>
        </div>
        <button class="btn-delete-text" data-id="${text.id}" title="Eliminar">🗑️</button>
      `;
      fragment.appendChild(card);
    });

    listEl.appendChild(fragment);
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

    // Delegación de eventos sobre los tokens
    contentEl.addEventListener('click', (e) => {
      const tokenSpan = e.target.closest('.token');
      const activeText = AppState.library.find(t => t.id === AppState.currentTextId);
      if (!tokenSpan || !activeText) return;

      const tokenIndex = parseInt(tokenSpan.dataset.index, 10);
      const tokenData = activeText.tokens[tokenIndex];
      if (!tokenData) return;

      document.querySelectorAll('.token.selected').forEach(el => el.classList.remove('selected'));
      tokenSpan.classList.add('selected');

      AppState.selectedToken = tokenData;

      const cleanFront = tokenData.w.replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, '').trim();

      wordEl.textContent = cleanFront || tokenData.w;
      phoneticEl.textContent = tokenData.p || '';
      defEl.textContent = tokenData.t || 'Sin traducción';

      const isAlreadySaved = AppState.deck.some(c => c.front.toLowerCase() === (cleanFront || tokenData.w).toLowerCase());
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

    // Añadir al mazo SRS
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
  },

  loadCurrentText() {
    const titleEl = document.getElementById('reader-title');
    const contentEl = document.getElementById('reader-content');
    const glossPanel = document.getElementById('gloss-panel');

    glossPanel.classList.add('hidden');
    AppState.selectedToken = null;

    const activeText = AppState.library.find(t => t.id === AppState.currentTextId);

    if (!activeText) {
      titleEl.textContent = 'Sin lectura seleccionada';
      contentEl.innerHTML = '<p class="placeholder-text">Selecciona una lectura en la biblioteca para comenzar.</p>';
      return;
    }

    titleEl.textContent = activeText.title;

    // Fragmento en memoria para 0 repintados
    const fragment = document.createDocumentFragment();
    activeText.tokens.forEach((token, index) => {
      const span = document.createElement('span');
      span.textContent = token.w + ' ';
      span.className = 'token';
      span.dataset.index = index;
      fragment.appendChild(span);
    });

    contentEl.innerHTML = '';
    contentEl.appendChild(fragment);
  }
};

// ==========================================
// MÓDULO: REPASO SRS
// ==========================================
const ReviewModule = {
  init() {
    const btnShowAnswer = document.getElementById('btn-show-answer');
    const ratingButtons = document.getElementById('srs-rating-buttons');

    btnShowAnswer.addEventListener('click', () => {
      document.getElementById('card-back-side').classList.remove('hidden');
      btnShowAnswer.classList.add('hidden');
      ratingButtons.classList.remove('hidden');
    });

    ratingButtons.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-rating');
      if (!btn) return;
      this.rateCurrentCard(btn.dataset.rating);
    });
  },

  startSession() {
    const today = new Date().toISOString().split('T')[0];
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

    backSide.classList.add('hidden');
    ratingButtons.classList.add('hidden');

    if (AppState.reviewQueue.length === 0 || AppState.currentCardIndex >= AppState.reviewQueue.length) {
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

    const updatedCard = SRSAlgorithm.calculateNextReview(currentCard, ratingKey);
    const deckIndex = AppState.deck.findIndex(c => c.id === currentCard.id);
    if (deckIndex !== -1) {
      AppState.deck[deckIndex] = updatedCard;
      Storage.saveDeck();
    }

    AppState.currentCardIndex++;
    this.renderCurrentCard();
  }
};

// ==========================================
// INTERFAZ DE USUARIO (Navegación)
// ==========================================
const UI = {
  initTabs() {
    const navButtons = document.querySelectorAll('.nav-btn');

    navButtons.forEach(button => {
      button.addEventListener('click', () => {
        const targetId = button.getAttribute('data-target');
        UI.switchTab(targetId);
      });
    });
  },

  switchTab(targetId) {
    const navButtons = document.querySelectorAll('.nav-btn');
    const views = document.querySelectorAll('.view');

    navButtons.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-target') === targetId);
    });

    views.forEach(view => {
      const isActive = view.id === targetId;
      view.classList.toggle('active', isActive);

      if (isActive && targetId === 'view-review') {
        ReviewModule.startSession();
      }
    });
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
// PUNTO DE ENTRADA (BOOTSTRAP)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  Storage.loadData();
  UI.initTabs();
  LibraryModule.init();
  ReaderModule.init();
  ReviewModule.init();

  // Render inicial
  LibraryModule.render();
  ReaderModule.loadCurrentText();
  UI.updateStats();
});