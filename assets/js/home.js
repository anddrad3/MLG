document.addEventListener('DOMContentLoaded', async () => {
      await MLGAccount.ready;
      const elements = {
        screenWrapper: document.getElementById('screen-wrapper'),
        appGrid: document.getElementById('app-grid'),
        utilityAppGrid: document.getElementById('utility-app-grid'),
        homeScreen: document.getElementById('home-screen'),
        pageContentWrapper: document.querySelector('#home-screen .page-content-wrapper'),
        appView: document.getElementById('app-view'),
        closeAppBtn: document.getElementById('close-app-btn'),
        appTitle: document.getElementById('app-title'),
        appContentArea: document.getElementById('app-content-area'),
        settingsModal: document.getElementById('settings-modal'),
        closeSettingsBtn: document.getElementById('close-settings-btn'),
        themeSwitch: document.getElementById('theme-switch'),
        settingsModalBackdrop: document.getElementById('settings-modal-backdrop'),
        profilePicModal: document.getElementById('profile-pic-modal'),
        closeProfilePicBtn: document.getElementById('close-profile-pic-btn'),
        profilePicModalBackdrop: document.getElementById('profile-pic-modal-backdrop'),
        modalProfilePic: document.getElementById('modal-profile-pic'),
        profilePicContainer: null,
        editProfileBtn: null,
        deletePicBtn: null,
        profileFileInput: document.getElementById('profile-file-input'),
        cropperModal: document.getElementById('cropper-modal'),
        cropperModalBackdrop: document.getElementById('cropper-modal-backdrop'),
        cropperImage: document.getElementById('cropper-image'),
        cropperZoom: document.getElementById('cropper-zoom'),
        cropperCancelBtn: document.getElementById('cropper-cancel-btn'),
        cropperPublishBtn: document.getElementById('cropper-publish-btn'),
        closeCropperBtn: document.getElementById('close-cropper-btn'),
        confirmModal: document.getElementById('confirm-modal'),
        confirmModalBackdrop: document.getElementById('confirm-modal-backdrop'),
        confirmModalText: document.getElementById('confirm-modal-text'),
        confirmCancelBtn: document.getElementById('confirm-cancel-btn'),
        confirmOkBtn: document.getElementById('confirm-ok-btn'),
        plansBtn: document.getElementById('plans-btn'),
        downloadDesktopBtn: document.getElementById('download-desktop-btn'),
        logoutBtn: document.getElementById('logout-btn'),
        deleteAccountOpenBtn: document.getElementById('delete-account-open-btn'),
        deleteAccountModal: document.getElementById('delete-account-modal'),
        deleteAccountBackdrop: document.getElementById('delete-account-backdrop'),
        deleteAccountCloseBtn: document.getElementById('delete-account-close-btn'),
        deleteAccountCancelBtn: document.getElementById('delete-account-cancel-btn'),
        downloadDataBtn: document.getElementById('download-data-btn'),
        deleteAccountConfirmBtn: document.getElementById('delete-account-confirm-btn'),
        bioEditModal: document.getElementById('bio-edit-modal'),
        bioEditModalBackdrop: document.getElementById('bio-edit-modal-backdrop'),
        closeBioEditBtn: document.getElementById('close-bio-edit-btn'),
        bioTextarea: document.getElementById('bio-textarea'),
        bioCharCount: document.getElementById('bio-char-count'),
        bioEditCancelBtn: document.getElementById('bio-edit-cancel-btn'),
        bioEditPublishBtn: document.getElementById('bio-edit-publish-btn'),
        profileBioContainer: null,
        profileBioText: null,
        friendsModal: document.getElementById('friends-modal'),
        friendsModalBackdrop: document.getElementById('friends-modal-backdrop'),
        closeFriendsBtn: document.getElementById('close-friends-btn'),
        friendTabs: document.querySelector('.friend-tabs'),
        friendsListsWrapper: document.getElementById('friends-lists-wrapper'),
        activeFriendsList: document.getElementById('active-friends-list'),
        receivedRequestsList: document.getElementById('received-requests-list'),
        sentRequestsList: document.getElementById('sent-requests-list'),
        blockedUsersList: document.getElementById('blocked-users-list'),
        friendsBtn: null,
        searchModal: document.getElementById('search-modal'),
        closeSearchBtn: document.getElementById('close-search-btn'),
        searchInput: document.getElementById('search-input'),
        autocompleteResults: document.getElementById('autocomplete-results'),
      };

      const state = { isEditMode:false, isAppDragging:false, theme:localStorage.getItem('theme')||'dark', draggedEl:null, dragGhost:null, dragOffset:{x:0,y:0}, activeGrid:null, dragOverEl:null, cropper:null, isUploading:false, confirmCallback:null };
      const LONG_PRESS_DURATION = 600;
      const DEFAULT_PROFILE_PIC = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2EwYTBhMCI+PHBhdGggZD0iTTEyIDEyYzIuMjEgMCA0LTEuNzkgNC00cy0xLjc5LTQtNC00LTQgMS43OS00IDQgMS43OSA0IDQgNHptMCAyYy0yLjY3IDAtOCAxLjM0LTggNHYyaDE2di0yYzAtMi42Ni01LjMzLTQtOC00eiIvPjwvc3ZnPg==';

      let userProfile = {
          name:MLGAccount.profile.name,
          bio: 'Adicione uma bio para se apresentar.',
          points:2847,
          rank:'Diamante',
          rankColor:'#b9f2ff',
          profilePic:'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face&auto=format&q=80',
          friends: [
              { id: 1, name: 'Beatriz Costa', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face&auto=format&q=80' },
              { id: 2, name: 'Carlos Pereira', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face&auto=format&q=80' },
              { id: 3, name: 'Diana Martins', avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100&h=100&fit=crop&crop=face&auto=format&q=80' },
              { id: 4, name: 'Eduardo Lima', avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100&h=100&fit=crop&crop=face&auto=format&q=80' }
          ],
          blockedUsers: [
              { id: 5, name: 'Fernanda Souza', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&crop=face&auto=format&q=80' },
              { id: 6, name: 'Gabriel Alves', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=face&auto=format&q=80' }
          ],
          friendRequestsReceived: [
              { id: 9, name: 'Juliana Rocha', avatar: 'https://images.unsplash.com/photo-1554151228-14d9def656e4?w=100&h=100&fit=crop&crop=face&auto=format&q=80' },
              { id: 10, name: 'Lucas Barbosa', avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100&h=100&fit=crop&crop=face&auto=format&q=80' }
          ],
          friendRequestsSent: [
              { id: 7, name: 'Helena Oliveira', avatar: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=100&h=100&fit=crop&crop=face&auto=format&q=80' }
          ]
      };

      // Simulated database of all users for searching
      const allUsers = [
          ...userProfile.friends.map(f => ({...f, isFriend: true})),
          ...userProfile.blockedUsers.map(b => ({...b, isBlocked: true})),
          { id: 7, name: 'Helena Oliveira', avatar: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=100&h=100&fit=crop&crop=face&auto=format&q=80', isFriend: false },
          { id: 8, name: 'Igor Santos', avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=100&h=100&fit=crop&crop=face&auto=format&q=80', isFriend: false },
          { id: 9, name: 'Juliana Rocha', avatar: 'https://images.unsplash.com/photo-1554151228-14d9def656e4?w=100&h=100&fit=crop&crop=face&auto=format&q=80', isFriend: false },
          { id: 10, name: 'Lucas Barbosa', avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100&h=100&fit=crop&crop=face&auto=format&q=80', isFriend: false }
      ];

      let homeApps = [
        { id:'financeiro', name:'Financeiro', icon:'landmark', color:'#25D366', protected:false, content:`<div class="p-6"><h1 class="text-3xl font-bold">Financeiro</h1></div>` },
        { id:'rotina', name:'Caderneta', icon:'notebook', color:'#007aff', protected:false, content:`<div class="p-6"><h1 class="text-3xl font-bold">Caderneta</h1></div>` },
        { id:'metas', name:'Metas', icon:'mountain', color:'#ff9500', protected:false, content:`<div class="p-6"><h1 class="text-3xl font-bold">Metas</h1></div>` },
        { id:'academia', name:'Academia', icon:'dumbbell', color:'#ff2d55', protected:false, content:`<div class="p-6"><h1 class="text-3xl font-bold">Academia</h1></div>` },
        { id:'galeria', name:'Galeria', icon:'image', color:'#AF52DE', protected:false, content:`<div class="flex flex-col items-center justify-center h-full text-center text-[var(--text-secondary)] opacity-75"><i class="fa-solid fa-images text-5xl mb-4"></i><h3 class="text-2xl font-semibold">Sua galeria está vazia</h3><p class="mt-2 text-lg">Comece a adicionar suas memórias.</p></div>` },
        { id:'mensagens', name:'Mensagens', icon:'message-circle', color:'#5AC8FA', protected:false, content:`<div class="flex flex-col items-center justify-center h-full text-center text-[var(--text-secondary)] opacity-75"><i class="fa-solid fa-comments text-5xl mb-4"></i><h3 class="text-2xl font-semibold">Mensagens</h3><p class="mt-2 text-lg">Sua caixa de entrada aparecerá aqui em breve.</p></div>` },
        { id:'settings', name:'Configurações', icon:'settings', color:'#8e8e93', protected:true, content:`` },
        { id:'ajuda', name:'Ajuda', icon:'help-circle', color:'#ff9500', protected:true, content: `<div class='p-2 md:p-4 text-left space-y-8'><div class='bg-gradient-to-br from-[var(--card-bg)] to-transparent p-8 rounded-2xl border border-[var(--border-color)] flex flex-col md:flex-row items-center gap-6 text-center md:text-left'><i data-lucide='help-circle' class='w-20 h-20 text-[var(--accent-blue)] flex-shrink-0'></i><div><h1 class='text-4xl font-bold text-[var(--text-primary)]'>Central de Ajuda</h1><p class='mt-2 text-lg text-[var(--text-secondary)]'>Tudo o que você precisa saber para dominar sua Web Desktop.</p></div></div><div class='grid grid-cols-1 lg:grid-cols-2 gap-6'><div class='bg-[var(--card-bg)] p-6 rounded-xl border border-[var(--border-color)] transition-all hover:border-[var(--accent-blue)]/50 hover:shadow-lg lg:col-span-2'><div class='flex items-center gap-4 mb-4'><i data-lucide='user-round' class='w-8 h-8 text-green-400'></i><h2 class='text-2xl font-semibold'>Seu Perfil</h2></div><ul class='space-y-3 text-[var(--text-secondary)]'><li class='flex items-start gap-3'><i data-lucide='image' class='w-5 h-5 mt-1 text-green-400 flex-shrink-0'></i><span><strong>Foto de Perfil:</strong> Clique na sua foto para abrir as opções de editar ou remover.</span></li><li class='flex items-start gap-3'><i data-lucide='text' class='w-5 h-5 mt-1 text-green-400 flex-shrink-0'></i><span><strong>Bio:</strong> Clique diretamente sobre o texto da sua bio (abaixo do nome) para editá-la.</span></li><li class='flex items-start gap-3'><i data-lucide='users' class='w-5 h-5 mt-1 text-green-400 flex-shrink-0'></i><span><strong>Amigos:</strong> Clique no contador de amigos para abrir a janela de gerenciamento social.</span></li></ul></div><div class='bg-[var(--card-bg)] p-6 rounded-xl border border-[var(--border-color)] transition-all hover:border-[var(--accent-blue)]/50 hover:shadow-lg lg:col-span-2'><div class='flex items-center gap-4 mb-4'><i data-lucide='move-3d' class='w-8 h-8 text-purple-400'></i><h2 class='text-2xl font-semibold'>Gerenciando Apps</h2></div><div class='grid grid-cols-1 md:grid-cols-2 gap-4 text-[var(--text-secondary)]'><div><h3 class='font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2'><i data-lucide='mouse-pointer-square' class='w-5 h-5'></i> Ativar Modo Edição</h3><p><strong>Clique longo</strong> em um app ou use o ícone <i data-lucide='edit-3' class='inline-block w-4 h-4'></i> 'Editar Layout'.</p></div><div><h3 class='font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2'><i data-lucide='grip' class='w-5 h-5'></i> Reorganizar</h3><p>No modo edição, <strong>clique e arraste</strong> os apps para a posição desejada.</p></div><div><h3 class='font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2'><i data-lucide='minus-circle' class='w-5 h-5 text-red-500'></i> Excluir</h3><p>Clique no botão <i data-lucide='minus' class='inline-block w-4 h-4'></i> que aparece nos apps para enviá-los à Lixeira.</p></div><div><h3 class='font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2'><i data-lucide='log-out' class='w-5 h-5'></i> Sair do Modo</h3><p>Clique em uma área vazia ou pressione a tecla <kbd class='px-2 py-1 text-xs font-semibold text-[var(--text-primary)] bg-[var(--input-bg)] border border-[var(--border-color)] rounded-md'>Esc</kbd>.</p></div></div></div><div class='bg-[var(--card-bg)] p-6 rounded-xl border border-[var(--border-color)] transition-all hover:border-[var(--accent-blue)]/50 hover:shadow-lg'><div class='flex items-center gap-4 mb-4'><i data-lucide='swords' class='w-8 h-8 text-blue-400'></i><h2 class='text-2xl font-semibold'>Social e Busca</h2></div><ul class='space-y-3 text-[var(--text-secondary)]'><li class='flex items-start gap-3'><i data-lucide='user-plus' class='w-5 h-5 mt-1 text-blue-400 flex-shrink-0'></i><span><strong>Adicionar Amigos:</strong> Use o app 'Busca' para encontrar e adicionar novos amigos.</span></li><li class='flex items-start gap-3'><i data-lucide='book-user' class='w-5 h-5 mt-1 text-blue-400 flex-shrink-0'></i><span><strong>Gerenciar Amigos:</strong> Na janela de amigos, você pode navegar entre suas amizades, solicitações recebidas, enviadas e usuários bloqueados.</span></li></ul></div><div class='bg-[var(--card-bg)] p-6 rounded-xl border border-[var(--border-color)] transition-all hover:border-[var(--accent-blue)]/50 hover:shadow-lg'><div class='flex items-center gap-4 mb-4'><i data-lucide='settings-2' class='w-8 h-8 text-orange-400'></i><h2 class='text-2xl font-semibold'>Configurações</h2></div><ul class='space-y-3 text-[var(--text-secondary)]'><li class='flex items-start gap-3'><i data-lucide='sun-moon' class='w-5 h-5 mt-1 text-orange-400 flex-shrink-0'></i><span><strong>Tema:</strong> Alterne entre os modos claro e escuro.</span></li><li class='flex items-start gap-3'><i data-lucide='log-out' class='w-5 h-5 mt-1 text-orange-400 flex-shrink-0'></i><span><strong>Sair:</strong> Desconecte-se da sua conta.</span></li><li class='flex items-start gap-3'><i data-lucide='trash-2' class='w-5 h-5 mt-1 text-red-500 flex-shrink-0'></i><span><strong>Deletar Conta:</strong> Exclua permanentemente sua conta e dados. Lembre-se de baixar seus dados antes, se desejar.</span></li></ul></div><div class='bg-[var(--card-bg)] p-6 rounded-xl border border-[var(--border-color)] transition-all hover:border-[var(--accent-blue)]/50 hover:shadow-lg lg:col-span-2'><div class='flex items-center gap-4 mb-4'><i data-lucide='keyboard' class='w-8 h-8 text-gray-400'></i><h2 class='text-2xl font-semibold'>Atalho Essencial: Tecla 'Esc'</h2></div><p class='text-[var(--text-secondary)] mb-4'>A tecla <kbd class='px-2 py-1 text-xs font-semibold text-[var(--text-primary)] bg-[var(--input-bg)] border border-[var(--border-color)] rounded-md'>Esc</kbd> é seu atalho universal para fechar janelas. A ordem de prioridade é:</p><ol class='list-decimal list-inside space-y-2 text-[var(--text-secondary)]'><li>Fecha a janela de um app que estiver aberta.</li><li>Fecha modais (como Configurações ou Foto de Perfil).</li><li>Sai do Modo de Edição.</li></ol></div></div></div>` },
        { id:'trash', name:'Lixeira', icon:'trash-2', color:'#6e6e73', protected:true, content:`` },
        { id:'busca', name:'Busca', icon:'search', color:'#50E3C2', protected:true, content:'' },
        { id:'edit-mode', name:'Editar Layout', icon:'edit-3', color:'#0A84FF', protected:true, content:`` },
        { id:'notificacoes', name:'Notificações', icon:'bell', color:'#ffcc00', protected:true, content:`<div class="flex flex-col items-center justify-center h-full text-center text-[var(--text-secondary)] opacity-75"><i data-lucide="bell-off" class="w-20 h-20 mb-6"></i><h3 class="text-2xl font-semibold">Nenhuma notificação nova</h3><p class="mt-2 text-lg">Suas notificações aparecerão aqui.</p></div>` }
      ];
      let trashApps = [];

      const utils = {
        formatNumber(n){return new Intl.NumberFormat('pt-BR').format(n)}
      };

      const render = {
        profileHeader(){
          const headerHTML = `
          <div class="profile-header">
              <div class="flex items-center gap-4">
                  <div id="profile-pic-container" class="profile-picture-container">
                      <div class="profile-picture-border"></div>
                      <img src="${userProfile.profilePic}" alt="Foto de ${userProfile.name.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}" class="profile-picture" loading="lazy">
                      <div class="profile-picture-overlay"><i data-lucide="pencil" style="color:white;width:24px;height:24px;"></i></div>
                  </div>
                  <div class="profile-info">
                      <h2>${userProfile.name.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</h2>
                      <div id="profile-bio-container" class="relative group cursor-pointer mt-1" aria-label="Editar bio">
                          <p id="profile-bio-text" class="text-sm text-[var(--text-secondary)] pr-5">${userProfile.bio}</p>
                          <i data-lucide="pencil" class="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-primary)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></i>
                      </div>
                      <button id="friends-btn" class="flex items-center gap-1.5 text-xs mt-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                          <i data-lucide="users" class="w-3.5 h-3.5"></i>
                          <span>${userProfile.friends.length} amigos</span>
                      </button>
                  </div>
              </div>
              <div id="datetime-weather-container">
                  <div id="time-display" class="font-cursive"></div>
                  <div id="date-display" class="font-cursive"></div>
              </div>
              <div class="profile-stats">
                  <div class="stat-item"><span>${utils.formatNumber(userProfile.points)}</span><i data-lucide="gem" style="width:20px;height:20px;color:var(--accent-blue)"></i></div>
                  <div class="stat-item"><span>${userProfile.rank}</span><i data-lucide="shield-check" style="width:20px;height:20px;color:${userProfile.rankColor}"></i></div>
                  <a href="graphs/" class="stat-item" title="Gráficos"><span>Gráficos</span><i data-lucide="bar-chart-2" style="width:20px;height:20px;"></i></a>
              </div>
          </div>`;
          elements.pageContentWrapper.insertAdjacentHTML('afterbegin', headerHTML);
          elements.profilePicContainer = document.getElementById('profile-pic-container');
          elements.friendsBtn = document.getElementById('friends-btn');
          elements.profileBioContainer = document.getElementById('profile-bio-container');
          elements.profileBioText = document.getElementById('profile-bio-text');
          lucide.createIcons();
        },
        apps(){
          elements.appGrid.innerHTML = ''; elements.utilityAppGrid.innerHTML = '';
          const utilityAppIds = ['settings', 'ajuda', 'edit-mode', 'trash', 'busca', 'notificacoes'];
          const mainFrag = document.createDocumentFragment(); const utilityFrag = document.createDocumentFragment();
          homeApps.forEach(app => {
            const icon = this.createAppIcon(app);
            if(utilityAppIds.includes(app.id)) { utilityFrag.appendChild(icon); } else { mainFrag.appendChild(icon); }
          });
          elements.appGrid.appendChild(mainFrag); elements.utilityAppGrid.appendChild(utilityFrag);
          lucide.createIcons();
        },
        createAppIcon(app){
          const container = document.createElement('div'); container.className = 'app-icon-container'; container.dataset.appId = app.id;
          if(app.protected) container.classList.add('protected');
          const delBtn = document.createElement('button'); delBtn.className = 'delete-btn'; delBtn.type = 'button'; delBtn.innerHTML = `<i data-lucide="minus" style="width:16px;height:16px;"></i>`; delBtn.setAttribute('aria-label', `Remover ${app.name}`);
          const handleDelete = (e) => { e.preventDefault(); e.stopPropagation(); if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); const icon = e.currentTarget.closest('.app-icon-container'); if(icon) { icon.style.transform = 'scale(0.9)'; setTimeout(() => { icon.style.transform = ''; actions.deleteApp(app.id); }, 150); } };
          delBtn.addEventListener('click', handleDelete); delBtn.addEventListener('touchend', handleDelete);
          const iconEl = document.createElement('div'); iconEl.className = 'app-icon'; iconEl.setAttribute('role','button'); iconEl.setAttribute('tabindex','0'); iconEl.setAttribute('aria-label',`Abrir ${app.name}`);
          iconEl.innerHTML = `<div class="app-icon-img" style="background-color:${app.color}15;border-color:${app.color}30;"><i data-lucide="${app.icon}" style="color:${app.color};width:36px;height:36px;"></i></div><span>${app.name}</span>`;
          const open = () => { if(state.isEditMode || state.isAppDragging) return; if(app.id === 'settings') { actions.openSettingsModal(); } else if (app.id === 'edit-mode') { actions.enterEditMode(); } else if (app.id === 'busca') { actions.openSearchModal(); } else { actions.openApp(app.id); } };
          iconEl.addEventListener('click', open); iconEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
          let pressTimer = null;
          const startPress = (e) => { if(e.type==='mousedown' && e.button!==0) return; pressTimer = setTimeout(() => { if (!state.isAppDragging) actions.enterEditMode(); navigator.vibrate?.(50); }, LONG_PRESS_DURATION); };
          const cancelPress = () => clearTimeout(pressTimer);
          ['mousedown','touchstart'].forEach(evt => iconEl.addEventListener(evt, startPress, {passive:true}));
          ['mouseup','mouseleave','touchend','touchcancel'].forEach(evt => iconEl.addEventListener(evt, cancelPress));
          container.appendChild(delBtn); container.appendChild(iconEl);
          return container;
        },
        trashContent(){
          let html = '';
          if (trashApps.length === 0){ html = `<div class="flex flex-col items-center justify-center h-full text-center text-[var(--text-secondary)] opacity-75"><i data-lucide="trash-2" class="w-20 h-20 mb-6"></i><h3 class="text-2xl font-semibold">A Lixeira está vazia</h3><p class="mt-2 text-lg">Apps excluídos aparecerão aqui.</p></div>`;
          } else { html = `<div class="mb-6 text-[var(--text-secondary)]"><span>${trashApps.length} app(s) na lixeira.</span></div><ul class="space-y-4">${trashApps.map(app => `<li class="flex items-center justify-between p-4 rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)] shadow-md transition-all hover:shadow-lg hover:border-[var(--accent-blue)]/50"><div class="flex items-center gap-4"><div class="flex-shrink-0 w-14 h-14 rounded-lg flex items-center justify-center" style="background-color:${app.color}1A;border:1px solid ${app.color}30;"><i data-lucide="${app.icon}" style="color:${app.color};width:28px;height:28px;"></i></div><span class="font-semibold text-lg">${app.name}</span></div><button data-app-id="${app.id}" class="restore-btn flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-[var(--accent-blue)] text-white hover:opacity-80 transition-all transform hover:scale-105"><i class="fa-solid fa-rotate-left"></i>Restaurar</button></li>`).join('')}</ul>`; }
          elements.appContentArea.innerHTML = html;
          lucide.createIcons();
          elements.appContentArea.querySelectorAll('.restore-btn').forEach(btn => { btn.onclick = () => actions.restoreApp(btn.dataset.appId); });
        },
        activeFriendsList() {
            const friendsHTML = userProfile.friends.map((friend, index) => `
                <li class="flex items-center justify-between gap-2 p-2 hover:bg-[var(--input-bg)] rounded-lg transition-colors">
                    <div class="flex items-center gap-3 overflow-hidden">
                      <img src="${friend.avatar}" alt="${friend.name}" class="w-10 h-10 rounded-full object-cover flex-shrink-0">
                      <span class="font-medium text-base truncate">${friend.name}</span>
                    </div>
                    <div class="flex items-center flex-shrink-0">
                        <button class="view-profile-btn text-[var(--text-secondary)] hover:text-white transition-colors p-2" data-friend-id="${friend.id}" aria-label="Ver perfil de ${friend.name}">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        <button class="message-friend-btn text-[var(--text-secondary)] hover:text-white transition-colors p-2" data-friend-id="${friend.id}" aria-label="Enviar mensagem para ${friend.name}">
                            <i class="fa-solid fa-comment-dots"></i>
                        </button>
                        <button class="block-friend-btn text-[var(--text-secondary)] hover:text-yellow-500 transition-colors p-2" data-friend-index="${index}" aria-label="Bloquear ${friend.name}">
                            <i class="fa-solid fa-ban"></i>
                        </button>
                        <button class="delete-friend-btn text-red-500 hover:text-red-400 transition-colors p-2" data-friend-index="${index}" aria-label="Remover ${friend.name}">
                            <i class="fa-solid fa-user-minus"></i>
                        </button>
                    </div>
                </li>
            `).join('');
            elements.activeFriendsList.innerHTML = friendsHTML || `<p class="text-center text-[var(--text-secondary)] p-4">Você não tem amigos adicionados.</p>`;
        },
        receivedRequestsList() {
            const requestsHTML = userProfile.friendRequestsReceived.map((user, index) => `
                <li class="flex items-center justify-between gap-4 p-2 hover:bg-[var(--input-bg)] rounded-lg transition-colors">
                    <div class="flex items-center gap-3 overflow-hidden">
                        <img src="${user.avatar}" alt="${user.name}" class="w-10 h-10 rounded-full object-cover flex-shrink-0">
                        <span class="font-medium text-base truncate">${user.name}</span>
                    </div>
                    <div class="flex items-center flex-shrink-0 gap-2">
                        <button class="accept-request-btn flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-lg bg-green-500 text-white hover:bg-green-600 transition-all transform hover:scale-105" data-request-index="${index}">
                            <i class="fa-solid fa-check"></i>Aceitar
                        </button>
                        <button class="decline-request-btn flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-lg bg-red-500 text-white hover:bg-red-600 transition-all transform hover:scale-105" data-request-index="${index}">
                            <i class="fa-solid fa-xmark"></i>Recusar
                        </button>
                    </div>
                </li>
            `).join('');
            elements.receivedRequestsList.innerHTML = requestsHTML || `<p class="text-center text-[var(--text-secondary)] p-4">Nenhuma solicitação de amizade.</p>`;
        },
        sentRequestsList() {
            const requestsHTML = userProfile.friendRequestsSent.map((user, index) => `
                <li class="flex items-center justify-between gap-4 p-2 hover:bg-[var(--input-bg)] rounded-lg transition-colors">
                    <div class="flex items-center gap-3 overflow-hidden">
                        <img src="${user.avatar}" alt="${user.name}" class="w-10 h-10 rounded-full object-cover flex-shrink-0">
                        <span class="font-medium text-base truncate">${user.name}</span>
                    </div>
                    <button class="cancel-request-btn flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-lg bg-gray-500 text-white hover:bg-gray-600 transition-all transform hover:scale-105" data-request-index="${index}">
                        <i class="fa-solid fa-ban"></i>Cancelar
                    </button>
                </li>
            `).join('');
            elements.sentRequestsList.innerHTML = requestsHTML || `<p class="text-center text-[var(--text-secondary)] p-4">Nenhum pedido de amizade pendente.</p>`;
        },
        blockedUsersList() {
            const blockedHTML = userProfile.blockedUsers.map((user, index) => `
                <li class="flex items-center justify-between gap-4 p-2 hover:bg-[var(--input-bg)] rounded-lg transition-colors">
                    <div class="flex items-center gap-3 overflow-hidden">
                        <img src="${user.avatar}" alt="${user.name}" class="w-10 h-10 rounded-full object-cover flex-shrink-0">
                        <span class="font-medium text-base truncate">${user.name}</span>
                    </div>
                    <button class="unblock-btn flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-lg bg-yellow-500 text-white hover:bg-yellow-600 transition-all transform hover:scale-105" data-user-index="${index}">
                        <i class="fa-solid fa-unlock"></i>Desbloquear
                    </button>
                </li>
            `).join('');
            elements.blockedUsersList.innerHTML = blockedHTML || `<p class="text-center text-[var(--text-secondary)] p-4">Nenhum usuário bloqueado.</p>`;
        },
        updateFriendCount() {
            if (elements.friendsBtn) {
                const span = elements.friendsBtn.querySelector('span');
                if (span) {
                    span.textContent = `${userProfile.friends.length} amigos`;
                }
            }
        },
      };

      const actions = {
        updateDateTime() {
            const now = new Date();
            const timeEl = document.getElementById('time-display');
            const dateEl = document.getElementById('date-display');
            if(timeEl && dateEl) {
                timeEl.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                dateEl.textContent = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
            }
        },
        openSettingsModal(){
            if (elements.appView.classList.contains('visible')) actions.closeApp();
            elements.settingsModal.classList.add('visible');
            elements.settingsModal.setAttribute('aria-hidden','false');
            elements.closeSettingsBtn.focus();
        },
        closeSettingsModal(){ elements.settingsModal.classList.remove('visible'); elements.settingsModal.setAttribute('aria-hidden','true'); },
        openProfilePicModal(){ elements.modalProfilePic.src = userProfile.profilePic; elements.profilePicModal.classList.add('visible'); elements.profilePicModal.setAttribute('aria-hidden','false'); elements.closeProfilePicBtn.focus(); },
        closeProfilePicModal(){ elements.profilePicModal.classList.remove('visible'); elements.profilePicModal.setAttribute('aria-hidden','true'); },
        openBioEditModal() {
            elements.bioTextarea.value = userProfile.bio === 'Adicione uma bio para se apresentar.' ? '' : userProfile.bio;
            actions.updateBioCharCount();
            elements.bioEditModal.classList.add('visible');
            elements.bioEditModal.setAttribute('aria-hidden', 'false');
            elements.bioTextarea.focus();
        },
        closeBioEditModal() {
            elements.bioEditModal.classList.remove('visible');
            elements.bioEditModal.setAttribute('aria-hidden', 'true');
        },
        updateBio() {
            const newBio = elements.bioTextarea.value.trim();
            if (newBio.length > 150) {
                actions.showToast('Sua bio não pode exceder 150 caracteres.', 'error');
                return;
            }
            userProfile.bio = newBio || 'Adicione uma bio para se apresentar.';
            elements.profileBioText.textContent = userProfile.bio;
            localStorage.setItem('userBio', userProfile.bio);
            actions.closeBioEditModal();
            actions.showToast('Bio atualizada com sucesso!', 'success');
        },
        updateBioCharCount() {
            const count = elements.bioTextarea.value.length;
            elements.bioCharCount.textContent = `${count} / 150`;
            elements.bioCharCount.classList.toggle('text-error', count > 150);
        },
        openFriendsModal() {
            render.activeFriendsList();
            render.receivedRequestsList();
            render.sentRequestsList();
            render.blockedUsersList();
            elements.friendsModal.classList.add('visible');
            elements.friendsModal.setAttribute('aria-hidden','false');
            elements.closeFriendsBtn.focus();
        },
        closeFriendsModal() { elements.friendsModal.classList.remove('visible'); elements.friendsModal.setAttribute('aria-hidden','true'); },
        openSearchModal() { elements.searchModal.classList.add('visible'); elements.searchModal.setAttribute('aria-hidden','false'); elements.searchInput.focus(); },
        closeSearchModal() { elements.searchInput.value = ''; elements.autocompleteResults.innerHTML = ''; elements.searchModal.classList.remove('visible'); elements.searchModal.setAttribute('aria-hidden','true'); },
        deleteFriend(index) {
            const friendName = userProfile.friends[index]?.name;
            if (friendName) {
                userProfile.friends.splice(index, 1);
                render.activeFriendsList();
                render.updateFriendCount();
                actions.showToast(`${friendName} foi removido(a).`, 'info');
            }
        },
        blockFriend(index) {
            const friend = userProfile.friends[index];
            if (friend) {
                userProfile.friends.splice(index, 1);
                userProfile.blockedUsers.push(friend);
                render.activeFriendsList();
                render.blockedUsersList();
                render.updateFriendCount();
                actions.showToast(`${friend.name} foi bloqueado(a).`, 'warning');
            }
        },
        acceptFriendRequest(index) {
            const request = userProfile.friendRequestsReceived[index];
            if (request) {
                userProfile.friendRequestsReceived.splice(index, 1);
                userProfile.friends.push(request);
                render.receivedRequestsList();
                render.activeFriendsList();
                render.updateFriendCount();
                actions.showToast(`Você e ${request.name} agora são amigos.`, 'success');
            }
        },
        declineFriendRequest(index) {
            const request = userProfile.friendRequestsReceived[index];
            if (request) {
                userProfile.friendRequestsReceived.splice(index, 1);
                render.receivedRequestsList();
                actions.showToast(`Solicitação de ${request.name} recusada.`, 'info');
            }
        },
        cancelFriendRequest(index) {
            const request = userProfile.friendRequestsSent[index];
            if (request) {
                userProfile.friendRequestsSent.splice(index, 1);
                render.sentRequestsList();
                actions.showToast(`Solicitação para ${request.name} cancelada.`, 'info');
            }
        },
        unblockUser(index) {
            const user = userProfile.blockedUsers[index];
            if (user) {
                userProfile.blockedUsers.splice(index, 1);
                render.blockedUsersList();
                actions.showToast(`${user.name} foi desbloqueado(a).`, 'success');
            }
        },
        sendFriendRequest(userId) {
            const user = allUsers.find(u => u.id === userId);
            if(user) {
                actions.showToast(`Pedido de amizade enviado para ${user.name}.`, 'success');
            }
        },
        showConfirm(message, onConfirm) { elements.confirmModalText.textContent = message; state.confirmCallback = onConfirm; elements.confirmModal.classList.add('visible'); elements.confirmModal.setAttribute('aria-hidden','false'); elements.confirmOkBtn.focus(); },
        closeConfirmModal() { elements.confirmModal.classList.remove('visible'); elements.confirmModal.setAttribute('aria-hidden','true'); state.confirmCallback = null; },
        openDeleteAccountModal() { elements.deleteAccountModal.classList.add('visible'); elements.deleteAccountModal.setAttribute('aria-hidden','false'); elements.deleteAccountCancelBtn.focus(); },
        closeDeleteAccountModal() { elements.deleteAccountModal.classList.remove('visible'); elements.deleteAccountModal.setAttribute('aria-hidden','true'); },
        async downloadUserDataPDF() {
            const btn = elements.downloadDataBtn; const originalHTML = btn.innerHTML; btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin w-5 h-5"></i><span>Preparando...</span>`;
            await new Promise(r => setTimeout(r, 1500));
            const userData = { profile: userProfile, apps: { home: homeApps, trash: trashApps }, exportDate: new Date().toISOString() };
            console.log("DADOS DO USUÁRIO:", userData); actions.showToast('Download dos dados simulado.', 'success');
            btn.disabled = false; btn.innerHTML = originalHTML;
        },
        performAccountDeletion() {
            actions.showToast('Conta deletada com sucesso.', 'info');
            setTimeout(() => { document.body.style.opacity = 0; setTimeout(() => window.location.reload(), 500); }, 1000);
        },
        updateProfilePicture(newSrc){
          if(newSrc === DEFAULT_PROFILE_PIC) { localStorage.removeItem('profilePicData'); MLGAccount.updatePhoto(''); } else { localStorage.setItem('profilePicData', newSrc); MLGAccount.updatePhoto(newSrc); }
          userProfile.profilePic = newSrc;
          const headerImg = elements.profilePicContainer?.querySelector('.profile-picture');
          if (headerImg) headerImg.src = newSrc;
          elements.modalProfilePic.src = newSrc;
        },
        deleteProfilePicture() { actions.updateProfilePicture(DEFAULT_PROFILE_PIC); actions.closeProfilePicModal(); actions.showToast('Foto de perfil removida.', 'info'); },
        triggerProfileFilePicker(){ elements.profileFileInput.value = ''; elements.profileFileInput.click(); },
        openCropperModal(dataUrl){
          elements.cropperImage.src = dataUrl; elements.cropperModal.classList.add('visible'); elements.cropperModal.setAttribute('aria-hidden','false');
          if (state.cropper) { try { state.cropper.destroy(); } catch(e){} state.cropper = null; }
          requestAnimationFrame(() => { state.cropper = new Cropper(elements.cropperImage, { aspectRatio: 1, viewMode: 1, dragMode: 'move', autoCropArea: 1, responsive: true, background: false, zoomOnWheel: true, ready(){ elements.cropperZoom.value = '1'; } }); lucide.createIcons(); });
        },
        closeCropperModal(){
          elements.cropperModal.classList.remove('visible'); elements.cropperModal.setAttribute('aria-hidden','true');
          if (state.cropper) { try { state.cropper.destroy(); } catch(e){} state.cropper = null; }
          elements.cropperImage.src = ''; elements.cropperZoom.value = '1';
        },
        async publishCropped(){
          if (!state.cropper || state.isUploading) return;
          state.isUploading = true; const originalHTML = elements.cropperPublishBtn.innerHTML;
          elements.cropperPublishBtn.disabled = true; elements.cropperPublishBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Publicando...`;
          try{
            const canvas = state.cropper.getCroppedCanvas({ width: 512, height: 512 }); const dataUrl = canvas.toDataURL('image/webp', 0.92);
            await new Promise(r => setTimeout(r, 800));
            actions.updateProfilePicture(dataUrl); actions.closeCropperModal(); actions.closeProfilePicModal(); actions.showToast('Foto atualizada!', 'success');
          } catch(err){ console.error(err); actions.showToast('Não foi possível publicar.', 'error');
          } finally { state.isUploading = false; elements.cropperPublishBtn.disabled = false; elements.cropperPublishBtn.innerHTML = originalHTML; }
        },
        deleteApp(appId){
          const app = homeApps.find(a => a.id === appId); if (!app) return; if (app.protected){ actions.showToast('Este app não pode ser removido.', 'warning'); return; }
          const idx = homeApps.findIndex(a => a.id === appId);
          if (idx > -1){
            const [deleted] = homeApps.splice(idx, 1); trashApps.push(deleted);
            const appElement = document.querySelector(`.app-icon-container[data-app-id="${appId}"]`);
            if (appElement) { appElement.style.transition = 'all 0.3s ease'; appElement.style.transform = 'scale(0)'; appElement.style.opacity = '0'; setTimeout(() => { appElement.remove(); render.apps(); }, 300); }
            actions.showToast(`'${deleted.name}' movido para a Lixeira.`, 'info');
          }
        },
        restoreApp(appId){
          const idx = trashApps.findIndex(a => a.id === appId);
          if (idx > -1){ const [restored] = trashApps.splice(idx, 1); homeApps.push(restored); render.apps(); render.trashContent(); actions.showToast(`'${restored.name}' restaurado.`, 'success'); }
        },
        enterEditMode(){ if (state.isAppDragging) return; state.isEditMode = true; document.querySelectorAll('.app-grid').forEach(grid => grid.classList.add('edit-mode')); actions.showToast('Modo de edição ativo', 'info'); },
        exitEditMode(){ if (!state.isEditMode) return; state.isEditMode = false; document.querySelectorAll('.app-grid').forEach(grid => grid.classList.remove('edit-mode')); },
        async openApp(appId){
          if (appId === 'financeiro') { if (await MLGAccount.unlock()) location.href='/financeiro/index.html'; return; }
          const app = homeApps.find(a => a.id === appId) || trashApps.find(a => a.id === appId); if (!app) return;
          if (app.id === 'settings') { actions.openSettingsModal(); return; }
          elements.appTitle.textContent = app.name;
          if (app.id === 'trash') render.trashContent(); else elements.appContentArea.innerHTML = app.content;
          elements.appView.classList.add('visible'); elements.appView.setAttribute('aria-hidden','false'); elements.closeAppBtn.focus();
          lucide.createIcons();
        },
        closeApp(){ elements.appView.classList.remove('visible'); elements.appView.setAttribute('aria-hidden','true'); },
        toggleTheme(){ const isNowLight = !document.documentElement.classList.contains('light'); document.documentElement.classList.toggle('light', isNowLight); state.theme = isNowLight ? 'light' : 'dark'; elements.themeSwitch.checked = isNowLight; localStorage.setItem('theme', state.theme); },
        showToast(message, type = 'info'){
          const existing = document.querySelector('.toast'); if (existing) existing.remove();
          const toast = document.createElement('div'); toast.className = `toast fixed top-5 left-1/2 -translate-x-1/2 z-[1001] px-4 py-2 rounded-lg text-base font-medium shadow-lg transition-all duration-300 transform -translate-y-20 opacity-0`;
          const colors = { success: 'bg-[var(--success-color)] text-white', error: 'bg-[var(--error-color)] text-white', warning: 'bg-[var(--warning-color)] text-black', info: 'bg-[var(--accent-blue)] text-white' };
          toast.className += ` ${colors[type] || colors.info}`; toast.textContent = message; document.body.appendChild(toast);
          requestAnimationFrame(() => { toast.style.transform = 'translateX(-50%) translateY(0)'; toast.style.opacity = '1'; });
          setTimeout(() => { toast.style.transform = 'translateX(-50%) translateY(-20px)'; toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
        }
      };

      const dragHandlers = {
        _positions: new Map(),
        createGhost(original){ const ghost = original.cloneNode(true); ghost.classList.add('drag-ghost'); ghost.classList.remove('dragging'); ghost.style.width = original.offsetWidth + 'px'; ghost.style.height = original.offsetHeight + 'px'; document.body.appendChild(ghost); return ghost; },
        updateGhostPosition(x,y){ if (state.dragGhost){ state.dragGhost.style.left = (x - state.dragOffset.x) + 'px'; state.dragGhost.style.top  = (y - state.dragOffset.y) + 'px'; } },
        recordPositions() { if (!state.activeGrid) return; this._positions.clear(); [...state.activeGrid.children].forEach(c => { if (c !== state.draggedEl) { this._positions.set(c, c.getBoundingClientRect()); } }); },
        animateReorder() { if (!state.activeGrid) return; [...state.activeGrid.children].forEach(c => { if (c !== state.draggedEl) { const oldPos = this._positions.get(c); if (!oldPos) return; const newPos = c.getBoundingClientRect(); const dx = oldPos.left - newPos.left; const dy = oldPos.top - newPos.top; if (dx !== 0 || dy !== 0) { requestAnimationFrame(() => { c.style.transform = `translate(${dx}px, ${dy}px)`; c.style.transition = 'transform 0s'; requestAnimationFrame(() => { c.style.transform = ''; c.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'; }); }); } } }); },
        start(e, el){ e.preventDefault(); state.isAppDragging = true; state.draggedEl = el; state.activeGrid = el.closest('.app-grid'); if (!state.activeGrid) return; const rect = el.getBoundingClientRect(); const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX; const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY; state.dragOffset.x = clientX - rect.left; state.dragOffset.y = clientY - rect.top; requestAnimationFrame(() => { state.dragGhost = this.createGhost(el); this.updateGhostPosition(clientX, clientY); el.classList.add('dragging'); }); document.body.style.userSelect = 'none'; document.body.style.cursor = 'grabbing'; },
        move: (e) => { if (!state.isAppDragging || !state.draggedEl) return; e.preventDefault(); const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX; const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY; dragHandlers.updateGhostPosition(clientX, clientY); const closest = dragHandlers.getClosestElement(clientX, clientY); const newTarget = closest ? closest.element : null; if (!newTarget) { const gridRect = state.activeGrid.getBoundingClientRect(); if (clientY > gridRect.top && clientY < gridRect.bottom && clientX > gridRect.left && clientX < gridRect.right) { if (state.draggedEl.nextSibling !== null) { dragHandlers.recordPositions(); state.activeGrid.appendChild(state.draggedEl); dragHandlers.animateReorder(); } } return; } if (newTarget === state.draggedEl) return; const rect = newTarget.getBoundingClientRect(); const isAfter = clientX > rect.left + rect.width / 2; let referenceNode = isAfter ? newTarget.nextSibling : newTarget; if (referenceNode !== state.draggedEl.nextSibling) { dragHandlers.recordPositions(); state.activeGrid.insertBefore(state.draggedEl, referenceNode); dragHandlers.animateReorder(); } },
        end(){ if (!state.draggedEl) return; const finalRect = state.draggedEl.getBoundingClientRect(); if (state.dragGhost) { state.dragGhost.style.transition = 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'; state.dragGhost.style.left = `${finalRect.left}px`; state.dragGhost.style.top = `${finalRect.top}px`; state.dragGhost.style.transform = 'scale(1) rotate(0deg)'; setTimeout(() => { if (state.dragGhost) state.dragGhost.remove(); state.draggedEl.classList.remove('dragging'); state.dragGhost = null; state.isAppDragging = false; state.draggedEl = null; state.activeGrid = null; state.dragOverEl = null; }, 250); } else { state.draggedEl.classList.remove('dragging'); state.isAppDragging = false; state.draggedEl = null; state.activeGrid = null; state.dragOverEl = null; } document.body.style.userSelect = ''; document.body.style.cursor = ''; dragHandlers.updateAppOrder(); },
        getClosestElement(x, y) { if (!state.activeGrid) return null; const draggableElements = [...state.activeGrid.querySelectorAll('.app-icon-container:not(.dragging)')]; return draggableElements.reduce((closest, child) => { const box = child.getBoundingClientRect(); const centerX = box.left + box.width / 2; const centerY = box.top + box.height / 2; const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)); if (distance < closest.distance) { return { distance, element: child }; } else { return closest; } }, { distance: Number.POSITIVE_INFINITY, element: null }); },
        updateAppOrder(){ const mainAppsOrderIds = Array.from(elements.appGrid.children).map(c => c.dataset.appId); const utilityAppsOrderIds = Array.from(elements.utilityAppGrid.children).map(c => c.dataset.appId); const allApps = [...homeApps, ...trashApps]; const reorderedMainApps = mainAppsOrderIds.map(id => allApps.find(a => a.id === id)).filter(Boolean); const reorderedUtilityApps = utilityAppsOrderIds.map(id => allApps.find(a => a.id === id)).filter(Boolean); homeApps = [...reorderedMainApps, ...reorderedUtilityApps]; }
      };

      const keyboard = {
        init(){ document.addEventListener('keydown', keyboard.handle); },
        handle(e){ if (e.key === 'Escape'){ if (elements.deleteAccountModal.classList.contains('visible')) actions.closeDeleteAccountModal(); else if (elements.confirmModal.classList.contains('visible')) actions.closeConfirmModal(); else if (elements.bioEditModal.classList.contains('visible')) actions.closeBioEditModal(); else if (elements.cropperModal.classList.contains('visible')) actions.closeCropperModal(); else if (elements.searchModal.classList.contains('visible')) actions.closeSearchModal(); else if (elements.friendsModal.classList.contains('visible')) actions.closeFriendsModal(); else if (elements.profilePicModal.classList.contains('visible')) actions.closeProfilePicModal(); else if (elements.settingsModal.classList.contains('visible')) actions.closeSettingsModal(); else if (elements.appView.classList.contains('visible')) actions.closeApp(); else if (state.isEditMode) actions.exitEditMode(); } }
      };

      const initTheme = () => { const isLight = state.theme === 'light'; document.documentElement.classList.toggle('light', isLight); elements.themeSwitch.checked = isLight; };

      const setupEventListeners = () => {
        elements.closeAppBtn.addEventListener('click', actions.closeApp);
        const handleDragStart = (e) => { if (!state.isEditMode) return; if (e.type === 'mousedown' && e.button !== 0) return; const el = e.target.closest('.app-icon-container'); if (el) { dragHandlers.start(e, el); } };
        elements.homeScreen.addEventListener('mousedown', handleDragStart);
        elements.homeScreen.addEventListener('touchstart', handleDragStart, { passive: false });
        document.addEventListener('mousemove', dragHandlers.move, { passive: false }); document.addEventListener('touchmove', dragHandlers.move, { passive: false });
        document.addEventListener('mouseup', dragHandlers.end); document.addEventListener('touchend', dragHandlers.end);
        document.addEventListener('click', (e) => { const insideIcon = e.target.closest('.app-icon-container'); const onDeleteBtn = e.target.closest('.delete-btn'); if (!state.isAppDragging && state.isEditMode && !insideIcon && !onDeleteBtn && !e.target.closest('.profile-header')) { actions.exitEditMode(); } }, true);
        elements.pageContentWrapper.addEventListener('click', (e) => { if (e.target.closest('#profile-pic-container')) actions.openProfilePicModal(); });
        elements.closeSettingsBtn.addEventListener('click', actions.closeSettingsModal);
        elements.settingsModalBackdrop.addEventListener('click', actions.closeSettingsModal);
        elements.themeSwitch.addEventListener('change', actions.toggleTheme);
        elements.closeProfilePicBtn.addEventListener('click', actions.closeProfilePicModal);
        elements.profilePicModalBackdrop.addEventListener('click', actions.closeProfilePicModal);
        elements.editProfileBtn = document.querySelector('#profile-pic-modal .edit-btn');
        elements.deletePicBtn = document.querySelector('#profile-pic-modal .delete-pic-btn');
        if (elements.editProfileBtn) { elements.editProfileBtn.addEventListener('click', (e) => { e.preventDefault(); actions.triggerProfileFilePicker(); }); }
        if (elements.deletePicBtn) { elements.deletePicBtn.addEventListener('click', (e) => { e.preventDefault(); actions.showConfirm('Deseja remover sua foto de perfil?', actions.deleteProfilePicture); }); }
        if (elements.profileBioContainer) { elements.profileBioContainer.addEventListener('click', actions.openBioEditModal); }
        elements.closeBioEditBtn.addEventListener('click', actions.closeBioEditModal);
        elements.bioEditModalBackdrop.addEventListener('click', actions.closeBioEditModal);
        elements.bioEditCancelBtn.addEventListener('click', actions.closeBioEditModal);
        elements.bioEditPublishBtn.addEventListener('click', actions.updateBio);
        elements.bioTextarea.addEventListener('input', actions.updateBioCharCount);
        elements.profileFileInput.addEventListener('change', (e) => { const file = e.target.files?.[0]; if (!file || !file.type.startsWith('image/')) { actions.showToast('Selecione uma imagem válida.', 'warning'); return; } const reader = new FileReader(); reader.onload = () => { actions.openCropperModal(reader.result); }; reader.onerror = () => actions.showToast('Falha ao carregar a imagem.', 'error'); reader.readAsDataURL(file); });
        elements.cropperCancelBtn.addEventListener('click', actions.closeCropperModal);
        elements.closeCropperBtn.addEventListener('click', actions.closeCropperModal);
        elements.cropperModalBackdrop.addEventListener('click', actions.closeCropperModal);
        elements.cropperPublishBtn.addEventListener('click', (e) => { e.preventDefault(); actions.publishCropped(); });
        elements.cropperZoom.addEventListener('input', (e) => { if (state.cropper) state.cropper.zoomTo(parseFloat(e.target.value || '1')); });
        elements.confirmCancelBtn.addEventListener('click', actions.closeConfirmModal);
        elements.confirmModalBackdrop.addEventListener('click', actions.closeConfirmModal);
        elements.confirmOkBtn.addEventListener('click', () => { if (typeof state.confirmCallback === 'function') { state.confirmCallback(); } actions.closeConfirmModal(); });
        elements.plansBtn.addEventListener('click', () => actions.showToast('Funcionalidade de Planos a ser implementada.', 'info'));
        elements.downloadDesktopBtn.addEventListener('click', () => actions.showToast('Download para desktop em breve!', 'info'));
        elements.logoutBtn.addEventListener('click', () => MLGAccount.lock());
        elements.deleteAccountOpenBtn.addEventListener('click', actions.openDeleteAccountModal);
        elements.deleteAccountCloseBtn.addEventListener('click', actions.closeDeleteAccountModal);
        elements.deleteAccountBackdrop.addEventListener('click', actions.closeDeleteAccountModal);
        elements.deleteAccountCancelBtn.addEventListener('click', actions.closeDeleteAccountModal);
        elements.downloadDataBtn.addEventListener('click', actions.downloadUserDataPDF);
        elements.deleteAccountConfirmBtn.addEventListener('click', actions.performAccountDeletion);
        elements.friendsBtn?.addEventListener('click', actions.openFriendsModal);
        elements.closeFriendsBtn.addEventListener('click', actions.closeFriendsModal);
        elements.friendsModalBackdrop.addEventListener('click', actions.closeFriendsModal);
        elements.activeFriendsList.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.delete-friend-btn');
            const viewBtn = e.target.closest('.view-profile-btn');
            const msgBtn = e.target.closest('.message-friend-btn');
            const blockBtn = e.target.closest('.block-friend-btn');

            if (blockBtn) {
                const index = parseInt(blockBtn.dataset.friendIndex, 10);
                const friend = userProfile.friends[index];
                if (friend) {
                    actions.showConfirm(`Bloquear ${friend.name}? Eles não poderão ver seu perfil ou enviar mensagens.`, () => actions.blockFriend(index));
                }
            } else if (deleteBtn) {
                const index = parseInt(deleteBtn.dataset.friendIndex, 10);
                const friend = userProfile.friends[index];
                if (friend) {
                    actions.showConfirm(`Remover ${friend.name} da sua lista de amigos?`, () => actions.deleteFriend(index));
                }
            } else if (viewBtn) {
                actions.showToast('Visualizar perfil: Em breve!', 'info');
            } else if (msgBtn) {
                actions.showToast('Enviar mensagem: Em breve!', 'info');
            }
        });
        elements.receivedRequestsList.addEventListener('click', (e) => {
            const acceptBtn = e.target.closest('.accept-request-btn');
            const declineBtn = e.target.closest('.decline-request-btn');
            if (acceptBtn) {
                const index = parseInt(acceptBtn.dataset.requestIndex, 10);
                actions.acceptFriendRequest(index);
            }
            if (declineBtn) {
                const index = parseInt(declineBtn.dataset.requestIndex, 10);
                actions.declineFriendRequest(index);
            }
        });
        elements.sentRequestsList.addEventListener('click', (e) => {
            const cancelBtn = e.target.closest('.cancel-request-btn');
            if (cancelBtn) {
                const index = parseInt(cancelBtn.dataset.requestIndex, 10);
                actions.cancelFriendRequest(index);
            }
        });
        elements.blockedUsersList.addEventListener('click', (e) => {
            const unblockBtn = e.target.closest('.unblock-btn');
            if (unblockBtn) {
                const index = parseInt(unblockBtn.dataset.userIndex, 10);
                const user = userProfile.blockedUsers[index];
                if (user) {
                    actions.showConfirm(`Tem certeza que deseja desbloquear ${user.name}?`, () => actions.unblockUser(index));
                }
            }
        });
        elements.friendTabs.addEventListener('click', (e) => {
            const tabButton = e.target.closest('button');
            if (!tabButton) return;

            elements.friendTabs.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
            tabButton.classList.add('active');

            const tabOrder = ['active', 'received', 'sent', 'blocked'];
            const tabName = tabButton.dataset.tab;
            const tabIndex = tabOrder.indexOf(tabName);

            if (tabIndex > -1 && elements.friendsListsWrapper) {
                elements.friendsListsWrapper.style.transform = `translateX(-${tabIndex * 100}%)`;
            }
        });
        elements.closeSearchBtn.addEventListener('click', actions.closeSearchModal);
        elements.searchModal.addEventListener('click', (e) => { if(e.target === elements.searchModal) actions.closeSearchModal(); });
        elements.searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (!query) {
                elements.autocompleteResults.innerHTML = '';
                return;
            }
            const friendIds = userProfile.friends.map(f => f.id);
            const blockedIds = userProfile.blockedUsers.map(b => b.id);
            const filteredUsers = allUsers.filter(user => user.name.toLowerCase().includes(query));

            const resultsHTML = filteredUsers.map(user => {
                let actionButton = '';
                if (friendIds.includes(user.id)) {
                    actionButton = '<span class="text-sm text-green-400 font-semibold">Amigo</span>';
                } else if (blockedIds.includes(user.id)) {
                    actionButton = '<span class="text-sm text-yellow-400 font-semibold">Bloqueado</span>';
                } else {
                    actionButton = `<button class="add-friend-btn flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-all" data-user-id="${user.id}">
                        <i class="fa-solid fa-user-plus"></i>Adicionar
                    </button>`;
                }

                return `
                <div class="p-2 pr-4 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-between text-white transition-colors">
                    <div class="flex items-center gap-3">
                        <img src="${user.avatar}" class="w-10 h-10 rounded-full">
                        <span>${user.name}</span>
                    </div>
                    ${actionButton}
                </div>`;
            }).join('');
            elements.autocompleteResults.innerHTML = resultsHTML;
        });
        elements.autocompleteResults.addEventListener('click', e => {
            const addBtn = e.target.closest('.add-friend-btn');
            if(addBtn) {
                const userId = parseInt(addBtn.dataset.userId, 10);
                actions.sendFriendRequest(userId);
                addBtn.disabled = true;
                addBtn.innerHTML = '<i class="fa-solid fa-check"></i> Enviado';
            }
        });
      };

      const loadPersistedProfilePic = () => { const saved = localStorage.getItem('profilePicData'); if (!saved) { userProfile.profilePic = DEFAULT_PROFILE_PIC; } else { userProfile.profilePic = saved; } };
      const loadPersistedBio = () => { const saved = localStorage.getItem('userBio'); if(saved) userProfile.bio = saved; };
      const init = () => {
        try{
          initTheme(); loadPersistedProfilePic(); loadPersistedBio();
          render.profileHeader(); render.apps();
          setupEventListeners(); keyboard.init();
          actions.updateDateTime(); setInterval(actions.updateDateTime, 1000);
          console.log('🚀 Web Desktop UI v23 inicializado');
          lucide.createIcons();
        } catch(err){ console.error('Erro na inicialização:', err); actions.showToast('Erro ao carregar aplicação', 'error'); }
      };

      init();
    });
