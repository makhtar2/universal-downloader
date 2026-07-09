document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const urlInput = document.getElementById('urlInput');
    const searchCard = document.querySelector('.search-card');
    const detectedPlatform = document.getElementById('detectedPlatform');
    const fetchBtn = document.getElementById('fetchBtn');
    const loadingInfo = document.getElementById('loadingInfo');
    
    const videoInfoCard = document.getElementById('videoInfoCard');
    const thumbImg = document.getElementById('thumbImg');
    const videoDuration = document.getElementById('videoDuration');
    const videoPlatformTag = document.getElementById('videoPlatformTag');
    const videoTitle = document.getElementById('videoTitle');
    const videoChannel = document.getElementById('videoChannel');
    
    const playlistSection = document.getElementById('playlistSection');
    const playlistItemsContainer = document.getElementById('playlistItems');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const deselectAllBtn = document.getElementById('deselectAllBtn');
    
    const formatSelect = document.getElementById('formatSelect');
    const convertSelect = document.getElementById('convertSelect');
    const downloadBtn = document.getElementById('downloadBtn');
    
    const progressSection = document.getElementById('progressSection');
    const progressBar = document.getElementById('progressBar');
    const progressPercentage = document.getElementById('progressPercentage');
    const progressStatus = document.getElementById('progressStatus');
    const progressSpeed = document.getElementById('progressSpeed');
    const progressEta = document.getElementById('progressEta');
    
    const successMessage = document.getElementById('successMessage');
    const errorMessage = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');
    
    const updateYtdlpBtn = document.getElementById('updateYtdlpBtn');
    const updateStatusText = document.getElementById('updateStatusText');

    let currentUrl = '';
    let eventSource = null;
    let isPlaylistInfo = false;
    let currentDetectedPlatform = 'unknown';

    // Platform detection patterns
    const platforms = [
        { name: 'youtube', icon: 'fa-brands fa-youtube', regex: /(youtube\.com|youtu\.be|youtube-nocookie\.com)/i, label: 'YouTube' },
        { name: 'instagram', icon: 'fa-brands fa-instagram', regex: /(instagram\.com|instagr\.am)/i, label: 'Instagram' },
        { name: 'tiktok', icon: 'fa-brands fa-tiktok', regex: /(tiktok\.com)/i, label: 'TikTok' },
        { name: 'x', icon: 'fa-brands fa-x-twitter', regex: /(twitter\.com|x\.com)/i, label: 'Twitter / X' },
        { name: 'linkedin', icon: 'fa-brands fa-linkedin', regex: /(linkedin\.com)/i, label: 'LinkedIn' },
        { name: 'facebook', icon: 'fa-brands fa-facebook', regex: /(facebook\.com|fb\.watch|fb\.com)/i, label: 'Facebook' }
    ];

    // Detect platform as user types or pastes URL
    function detectPlatform() {
        const url = urlInput.value.trim();
        
        // Remove existing state classes
        searchCard.classList.remove('state-youtube', 'state-instagram', 'state-tiktok', 'state-x', 'state-linkedin', 'state-facebook');
        detectedPlatform.classList.add('hidden');
        currentDetectedPlatform = 'unknown';

        if (!url) return;

        for (const platform of platforms) {
            if (platform.regex.test(url)) {
                searchCard.classList.add(`state-${platform.name}`);
                detectedPlatform.querySelector('.text').innerText = platform.label;
                
                // Set platform badge icon
                const badgeIcon = detectedPlatform.querySelector('i') || document.createElement('i');
                badgeIcon.className = `${platform.icon} platform-badge-icon`;
                if (!detectedPlatform.querySelector('.platform-badge-icon')) {
                    detectedPlatform.insertBefore(badgeIcon, detectedPlatform.firstChild);
                }
                
                detectedPlatform.classList.remove('hidden');
                currentDetectedPlatform = platform.name;
                break;
            }
        }
    }

    urlInput.addEventListener('input', detectPlatform);
    urlInput.addEventListener('paste', () => setTimeout(detectPlatform, 50));

    // Toggle advanced options
    const advancedToggleBtn = document.getElementById('advancedToggleBtn');
    const advancedContent = document.getElementById('advancedContent');
    const advancedChevron = document.getElementById('advancedChevron');

    advancedToggleBtn.addEventListener('click', () => {
        advancedContent.classList.toggle('hidden');
        if (advancedContent.classList.contains('hidden')) {
            advancedChevron.className = 'fa-solid fa-chevron-down';
        } else {
            advancedChevron.className = 'fa-solid fa-chevron-up';
        }
    });

    // Select/Deselect all playlist items
    selectAllBtn.addEventListener('click', () => {
        const checkboxes = playlistItemsContainer.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = true);
    });

    deselectAllBtn.addEventListener('click', () => {
        const checkboxes = playlistItemsContainer.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);
    });

    function resetUI() {
        videoInfoCard.classList.add('hidden');
        progressSection.classList.add('hidden');
        successMessage.classList.add('hidden');
        errorMessage.classList.add('hidden');
        playlistSection.classList.add('hidden');
        playlistItemsContainer.innerHTML = '';
        progressBar.style.width = '0%';
        progressPercentage.innerText = '0%';
        progressStatus.innerText = 'Initialisation...';
        progressSpeed.innerText = '--';
        progressEta.innerText = '--';
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }
    }

    function showError(msg) {
        errorText.innerText = msg;
        errorMessage.classList.remove('hidden');
        loadingInfo.classList.add('hidden');
        window.scrollTo({ top: errorMessage.offsetTop - 50, behavior: 'smooth' });
    }

    // Fetch video info
    fetchBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url) return;
        
        currentUrl = url;
        resetUI();
        loadingInfo.classList.remove('hidden');
        fetchBtn.disabled = true;
        fetchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyse...';

        try {
            const response = await fetch('/api/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: currentUrl })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.detail || "Impossible de récupérer les informations de la vidéo. Assurez-vous que le lien est valide.");
            }

            // Populate preview details
            thumbImg.src = data.thumbnail || '/static/icon.png';
            videoTitle.innerText = data.title;
            videoChannel.innerText = data.channel || 'Auteur';
            videoDuration.innerText = data.duration ? data.duration : '--:--';
            
            // Set platform tag branding
            const platformInfo = platforms.find(p => p.name === data.platform) || { label: 'Vidéo', icon: 'fa-solid fa-play' };
            videoPlatformTag.innerHTML = `<i class="${platformInfo.icon}"></i> ${platformInfo.label}`;
            videoPlatformTag.className = `platform-indicator-tag badge-${data.platform || 'unknown'}`;

            isPlaylistInfo = data.is_playlist;

            if (isPlaylistInfo && data.entries) {
                playlistSection.classList.remove('hidden');
                data.entries.forEach(entry => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'playlist-item';
                    
                    const label = document.createElement('label');
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.value = entry.index;
                    checkbox.checked = true; // checked by default
                    
                    const indexSpan = document.createElement('span');
                    indexSpan.className = 'item-index';
                    indexSpan.innerText = entry.index;

                    const titleSpan = document.createElement('span');
                    titleSpan.className = 'item-title';
                    titleSpan.innerText = entry.title;
                    titleSpan.title = entry.title; 

                    label.appendChild(checkbox);
                    label.appendChild(indexSpan);
                    label.appendChild(titleSpan);
                    
                    itemDiv.appendChild(label);
                    playlistItemsContainer.appendChild(itemDiv);
                });
            }

            loadingInfo.classList.add('hidden');
            videoInfoCard.classList.remove('hidden');
            window.scrollTo({ top: videoInfoCard.offsetTop - 50, behavior: 'smooth' });
            
        } catch (error) {
            showError(error.message);
        } finally {
            fetchBtn.disabled = false;
            fetchBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Analyser';
        }
    });

    // Start download process
    downloadBtn.addEventListener('click', async () => {
        if (!currentUrl) return;
        
        let playlistItemsStr = null;
        if (isPlaylistInfo) {
            const checkboxes = playlistItemsContainer.querySelectorAll('input[type="checkbox"]:checked');
            const selectedIndexes = Array.from(checkboxes).map(cb => cb.value);
            if (selectedIndexes.length === 0) {
                showError("Veuillez sélectionner au moins une vidéo de la playlist à télécharger.");
                return;
            }
            playlistItemsStr = selectedIndexes.join(',');
        }

        downloadBtn.disabled = true;
        downloadBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Préparation...';
        errorMessage.classList.add('hidden');
        successMessage.classList.add('hidden');

        try {
            const formatValue = formatSelect.value;
            const convertValue = convertSelect.value;

            const payload = {
                url: currentUrl,
                format: formatValue,
                playlist_items: playlistItemsStr,
                convert_format: convertValue
            };

            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.detail || "Erreur lors du démarrage du téléchargement.");
            }

            const taskId = data.task_id;
            
            progressSection.classList.remove('hidden');
            progressBar.style.width = '0%';
            progressBar.style.background = 'linear-gradient(90deg, #818cf8, #6366f1, #3b82f6)';
            window.scrollTo({ top: progressSection.offsetTop - 50, behavior: 'smooth' });

            downloadBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Téléchargement en cours';
            
            // Connect to Server-Sent Events progress
            eventSource = new EventSource(`/api/progress?task_id=${taskId}`);
            
            eventSource.onmessage = (event) => {
                const pData = JSON.parse(event.data);
                
                if (pData.status === 'downloading') {
                    let statusMsg = 'Téléchargement...';
                    if (pData.filename) {
                        const filePart = pData.filename.split('/').pop().split('\\').pop();
                        // Cut filename if too long
                        statusMsg = filePart.length > 30 ? `En cours : ...${filePart.substring(filePart.length - 27)}` : `En cours : ${filePart}`;
                    }
                    progressStatus.innerText = statusMsg;
                    progressPercentage.innerText = pData.percentage;
                    progressBar.style.width = pData.percentage;
                    progressSpeed.innerText = pData.speed;
                    progressEta.innerText = pData.eta;
                } 
                else if (pData.status === 'finished') {
                    progressStatus.innerText = pData.message;
                    progressBar.style.width = '100%';
                    progressSpeed.innerText = 'Encapsulation';
                    progressEta.innerText = 'Calcul en cours';
                }
                else if (pData.status === 'completed') {
                    progressSection.classList.add('hidden');
                    successMessage.classList.remove('hidden');
                    downloadBtn.disabled = false;
                    downloadBtn.innerHTML = '<i class="fa-solid fa-download"></i> Télécharger à nouveau';
                    eventSource.close();
                    
                    // Trigger browser file download
                    if (pData.download_url) {
                        const a = document.createElement('a');
                        a.style.display = 'none';
                        a.href = pData.download_url;
                        a.download = ''; 
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                    }
                }
                else if (pData.status === 'error') {
                    progressSection.classList.add('hidden');
                    showError("Erreur lors du téléchargement : " + pData.message);
                    downloadBtn.disabled = false;
                    downloadBtn.innerHTML = '<i class="fa-solid fa-download"></i> Réessayer';
                    eventSource.close();
                }
            };
            
            eventSource.onerror = (err) => {
                console.error("SSE Connection Error", err);
                eventSource.close();
            };

        } catch (error) {
            showError(error.message);
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = '<i class="fa-solid fa-download"></i> Démarrer le téléchargement';
        }
    });

    // Update yt-dlp manually
    updateYtdlpBtn.addEventListener('click', async () => {
        updateYtdlpBtn.disabled = true;
        updateYtdlpBtn.classList.add('loading');
        updateStatusText.className = 'update-status-text';
        updateStatusText.innerText = ' Vérification des mises à jour...';

        try {
            const response = await fetch('/api/admin/update-ytdlp', {
                method: 'POST'
            });
            const data = await response.json();
            
            if (response.ok && data.status === 'success') {
                updateStatusText.classList.add('success');
                updateStatusText.innerHTML = ' <i class="fa-solid fa-circle-check"></i> Extracteur mis à jour avec succès !';
            } else {
                throw new Error(data.message || 'Erreur inconnue.');
            }
        } catch (error) {
            updateStatusText.classList.add('error');
            updateStatusText.innerHTML = ' <i class="fa-solid fa-circle-xmark"></i> Échec de la mise à jour.';
            console.error('Failed to update yt-dlp:', error);
        } finally {
            updateYtdlpBtn.disabled = false;
            updateYtdlpBtn.classList.remove('loading');
            // Clear status after 5s
            setTimeout(() => {
                updateStatusText.innerText = '';
            }, 5000);
        }
    });

    // PWA Service Worker Registration
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('Service Worker registered successfully! Scope:', reg.scope))
                .catch(err => console.log('Service Worker registration failed:', err));
        });
    }
});
