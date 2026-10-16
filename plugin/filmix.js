(function () {
    'use strict';

    if (window.filmix_online_plugin) return;

    window.filmix_online_plugin = true;

    var VERSION = '2.0.0';
    var COMPONENT = 'filmix_online';

    /* ---------------- lang ---------------- */

    Lampa.Lang.add({
        filmix_online_watch: {
            ru: 'Смотреть на Filmix',
            uk: 'Дивитися на Filmix',
            en: 'Watch on Filmix'
        },
        filmix_online_proxy_title: {
            ru: 'Адрес прокси',
            uk: 'Адреса проксі',
            en: 'Proxy URL'
        },
        filmix_online_proxy_descr: {
            ru: 'Обязательно. Worker из папки proxy, например https://lampa-zetflix.you.workers.dev',
            uk: 'Обовʼязково. Worker з папки proxy, наприклад https://lampa-zetflix.you.workers.dev',
            en: 'Required. Worker from the proxy folder, e.g. https://lampa-zetflix.you.workers.dev'
        },
        filmix_online_proxy_token_title: {
            ru: 'Токен прокси',
            uk: 'Токен проксі',
            en: 'Proxy token'
        },
        filmix_online_proxy_token_descr: {
            ru: 'Если на прокси задан TOKEN',
            uk: 'Якщо на проксі задано TOKEN',
            en: 'If TOKEN is set on the proxy'
        },
        filmix_online_user_token_title: {
            ru: 'Токен Filmix',
            uk: 'Токен Filmix',
            en: 'Filmix token'
        },
        filmix_online_user_token_descr: {
            ru: 'Необязательно. Токен устройства с filmix.my/consoles для аккаунта PRO',
            uk: 'Необовʼязково. Токен пристрою з filmix.my/consoles для акаунта PRO',
            en: 'Optional. Device token from filmix.my/consoles for a PRO account'
        },
        filmix_online_need_proxy: {
            ru: 'Укажите адрес прокси в Настройки → Filmix',
            uk: 'Вкажіть адресу проксі в Налаштування → Filmix',
            en: 'Set the proxy URL in Settings → Filmix'
        },
        filmix_online_not_found: {
            ru: 'На Filmix ничего не найдено. Уточните название в поиске фильтра',
            uk: 'На Filmix нічого не знайдено. Уточніть назву в пошуку фільтра',
            en: 'Nothing found on Filmix. Refine the title in the filter search'
        },
        filmix_online_choose: {
            ru: 'Выберите вариант',
            uk: 'Виберіть варіант',
            en: 'Choose a title'
        },
        filmix_online_empty: {
            ru: 'Нет доступных видео',
            uk: 'Немає доступних відео',
            en: 'No videos available'
        },
        filmix_online_error: {
            ru: 'Ошибка запроса к Filmix',
            uk: 'Помилка запиту до Filmix',
            en: 'Filmix request error'
        },
        filmix_online_episode: {
            ru: 'Серия',
            uk: 'Серія',
            en: 'Episode'
        }
    });

    /* ---------------- templates ---------------- */

    Lampa.Template.add('filmix_online_css', '<style>' +
        '.fxo-item{display:flex;align-items:center;padding:1em 1.2em;margin-bottom:0.6em;background-color:rgba(0,0,0,0.3);border-radius:0.6em}' +
        '.fxo-item.focus{background-color:#fff;color:#000}' +
        '.fxo-item__num{flex-shrink:0;width:2.6em;font-size:1.6em;font-weight:600;opacity:0.6}' +
        '.fxo-item__body{flex-grow:1;min-width:0}' +
        '.fxo-item__title{font-size:1.3em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.fxo-item__info{margin-top:0.3em;opacity:0.6;font-size:0.95em}' +
        '.fxo-item__info:empty{display:none}' +
        '.fxo-item__timeline{margin-top:0.5em}' +
        '.fxo-item__timeline:empty{display:none}' +
        '.fxo-item__quality{flex-shrink:0;margin-left:1em;padding:0.2em 0.5em;border:1px solid currentColor;border-radius:0.3em;font-size:0.9em}' +
        '.fxo-item__quality:empty{display:none}' +
        '.fxo-item--viewed .fxo-item__num{opacity:0.25}' +
        '.fxo-empty{padding:2em 1em;text-align:center;opacity:0.7;font-size:1.2em}' +
        '</style>');

    Lampa.Template.add('filmix_online_item',
        '<div class="fxo-item selector">' +
            '<div class="fxo-item__num">{num}</div>' +
            '<div class="fxo-item__body">' +
                '<div class="fxo-item__title">{title}</div>' +
                '<div class="fxo-item__info">{info}</div>' +
                '<div class="fxo-item__timeline"></div>' +
            '</div>' +
            '<div class="fxo-item__quality">{quality}</div>' +
        '</div>');

    Lampa.Template.add('filmix_online_empty', '<div class="fxo-empty selector">{text}</div>');

    $('body').append(Lampa.Template.get('filmix_online_css', {}, true));

    /* ---------------- helpers ---------------- */

    function storageString(name) {
        return (Lampa.Storage.get(name, '') + '').trim();
    }

    function escapeHtml(str) {
        return (str + '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function isSerial(movie) {
        return !!(movie.name || movie.original_name || movie.number_of_seasons);
    }

    // Lampa may fill a placeholder `title` on serial cards, so serials use name / original_name first
    function movieTitle(movie) {
        return (isSerial(movie) ? movie.name || movie.title : movie.title || movie.name) || '';
    }

    function movieOriginalTitle(movie) {
        return (isSerial(movie) ? movie.original_name || movie.original_title : movie.original_title || movie.original_name) || '';
    }

    function numericKeys(obj) {
        return Object.keys(obj || {}).sort(function (a, b) {
            return (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0);
        });
    }

    function qualityNumber(label) {
        return parseInt(label, 10) || 0;
    }

    function sortQualities(map) {
        var sorted = {};

        Object.keys(map || {}).sort(function (a, b) {
            return qualityNumber(b) - qualityNumber(a);
        }).forEach(function (key) {
            sorted[key] = map[key];
        });

        return sorted;
    }

    // default link: the user's preferred quality from Lampa settings or the closest lower one
    function pickUrl(map) {
        var keys = Object.keys(sortQualities(map));
        var prefer = parseInt(Lampa.Storage.field('video_quality_default'), 10) || 1080;

        for (var i = 0; i < keys.length; i++) {
            if (qualityNumber(keys[i]) <= prefer) return map[keys[i]];
        }

        return keys.length ? map[keys[keys.length - 1]] : '';
    }

    function bestLabel(map) {
        var keys = Object.keys(sortQualities(map));

        return keys.length ? keys[0] : '';
    }

    /**
     * Filmix links come in two shapes:
     *   movies:   .../name_[2160,,1080,720,480,].mp4     - list of available qualities in brackets
     *   episodes: .../s01e01_%s.mp4 + qualities: [1080, 720, 480]
     */
    function linkQualities(link, qualities) {
        var map = {};
        var bracket = (link || '').match(/\[([\d,]*)\]/);

        if (bracket) {
            bracket[1].split(',').forEach(function (q) {
                if (q) map[q + 'p'] = link.replace(bracket[0], q);
            });
        }
        else if ((link || '').indexOf('%s') !== -1) {
            (qualities || []).forEach(function (q) {
                map[q + 'p'] = link.replace('%s', q);
            });
        }
        else if (link) map.auto = link;

        return map;
    }

    function isBlocked(voice, link) {
        return /заблокировано/i.test(voice || '') || /\/abuse_/.test(link || '');
    }

    function normalizeTitle(str) {
        return (str || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');
    }

    /* ---------------- api ---------------- */

    function FilmixApi(network) {
        var dev = storageString('filmix_online_device');

        if (!dev) {
            dev = Lampa.Utils.uid(16);
            Lampa.Storage.set('filmix_online_device', dev);
        }

        function base() {
            var proxy = storageString('filmix_online_proxy');

            if (!/^https?:\/\//.test(proxy)) proxy = 'https://' + proxy;

            return proxy.replace(/\/+$/, '') + '/filmix/';
        }

        function url(method, params) {
            var query = 'user_dev_apk=2.2.13&user_dev_id=' + dev + '&user_dev_name=Xiaomi&user_dev_os=12&user_dev_vendor=Xiaomi' +
                '&user_dev_token=' + encodeURIComponent(storageString('filmix_online_user_token'));
            var proxyToken = storageString('filmix_online_proxy_token');

            if (params) query = params + '&' + query;
            if (proxyToken) query += '&token=' + encodeURIComponent(proxyToken);

            return base() + method + '?' + query;
        }

        // Filmix returns empty player_links to any browser User-Agent (it can't be changed from Lampa), so the proxy is required
        this.blocked = function () {
            return !storageString('filmix_online_proxy');
        };

        this.search = function (query, done, fail) {
            network.timeout(15000);
            network.silent(url('search', 'story=' + encodeURIComponent(query)), function (json) {
                done(Array.isArray(json) ? json : []);
            }, fail);
        };

        this.post = function (id, done, fail) {
            network.timeout(15000);
            network.silent(url('post/' + id), done, fail);
        };
    }

    /* ---------------- component ---------------- */

    function component(object) {
        var self = this;
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);
        var api = new FilmixApi(network);

        var serial = isSerial(object.movie);
        var initialized = false;
        var last = false;
        var data = null;
        var seasons = [];
        var episodesInfo = [];

        var choice = getChoice();

        function getChoice() {
            var all = Lampa.Storage.cache('filmix_online_choice', 3000, {});
            var saved = all[object.movie.id] || {};

            return {
                season: saved.season || 0,
                voice: saved.voice || 0,
                voice_name: saved.voice_name || '',
                episodes_view: saved.episodes_view || {}
            };
        }

        function saveChoice() {
            var all = Lampa.Storage.cache('filmix_online_choice', 3000, {});

            all[object.movie.id] = choice;

            Lampa.Storage.set('filmix_online_choice', all);
        }

        function cacheKey() {
            return (serial ? 'tv_' : 'movie_') + object.movie.id;
        }

        function savedFilmixId() {
            return Lampa.Storage.cache('filmix_online_ids', 1000, {})[cacheKey()];
        }

        function saveFilmixId(id) {
            var all = Lampa.Storage.cache('filmix_online_ids', 1000, {});

            all[cacheKey()] = id;

            Lampa.Storage.set('filmix_online_ids', all);
        }

        this.create = function () {
            return this.render();
        };

        this.render = function () {
            return files.render();
        };

        this.initialize = function () {
            filter.onBack = function () {
                self.start();
            };

            filter.onSearch = function (value) {
                if (value) self.find(value, true);
            };

            filter.onSelect = function (type, a, b) {
                if (type !== 'filter' || !data) return;

                if (a.reset) {
                    choice.season = 0;
                    choice.voice = 0;
                    choice.voice_name = '';
                }
                else if (a.stype == 'season') {
                    choice.season = b.index;
                }
                else if (a.stype == 'voice') {
                    choice.voice = b.index;
                    choice.voice_name = self.voices()[b.index].name;
                }

                saveChoice();
                self.refresh();
            };

            if (filter.addButtonBack) filter.addButtonBack();

            filter.render().find('.filter--sort').remove();

            files.appendFiles(scroll.render());
            files.appendHead(filter.render());

            scroll.body().addClass('torrent-list');
            scroll.minus(files.render().find('.explorer__files-head'));

            this.start_search();
        };

        this.start_search = function () {
            if (api.blocked()) return this.empty(Lampa.Lang.translate('filmix_online_need_proxy'));

            var id = savedFilmixId();

            if (id) return this.load(id);

            this.find(movieTitle(object.movie) || object.search, false);
        };

        /* ---------- search ---------- */

        this.find = function (query, manual) {
            this.reset();
            this.loading(true);

            api.search(query, function (results) {
                var original = movieOriginalTitle(object.movie);

                if (!results.length && !manual && original && original !== query) {
                    return api.search(original, function (more) {
                        self.choose(more, false);
                    }, self.failed);
                }

                self.choose(results, manual);
            }, this.failed);
        };

        this.score = function (item) {
            var movie = object.movie;
            var year = parseInt(((movie.release_date || movie.first_air_date || '') + '').slice(0, 4), 10);
            var score = 0;

            if (normalizeTitle(item.original_title) && normalizeTitle(item.original_title) == normalizeTitle(movieOriginalTitle(movie))) score += 2;
            if (normalizeTitle(item.title) && normalizeTitle(item.title) == normalizeTitle(movieTitle(movie))) score += 2;
            if (year && item.year == year) score += 2;
            else if (year && Math.abs(item.year - year) == 1) score += 1;

            return score;
        };

        this.choose = function (results, manual) {
            if (!results.length) return this.empty(Lampa.Lang.translate('filmix_online_not_found'));

            var scored = results.map(function (item) {
                return { item: item, score: self.score(item) };
            }).sort(function (a, b) {
                return b.score - a.score;
            });

            var best = scored[0];
            var unique = scored.length == 1 || scored[1].score < best.score;

            if (!manual && best.score >= 4 && unique) return this.load(best.item.id);

            this.similars(scored.map(function (s) {
                return s.item;
            }));
        };

        this.similars = function (items) {
            this.reset();

            items.forEach(function (item, i) {
                var info = [item.year, item.original_title].filter(Boolean).join(' · ');
                var html = Lampa.Template.get('filmix_online_item', {
                    num: i + 1,
                    title: escapeHtml(item.title || item.original_title || ''),
                    info: escapeHtml(info),
                    quality: escapeHtml(item.quality || '')
                });

                html.on('hover:enter', function () {
                    self.load(item.id);
                }).on('hover:focus', function (e) {
                    last = e.target;
                    scroll.update($(e.target), true);
                });

                scroll.append(html);
            });

            filter.set('filter', []);
            filter.chosen('filter', [Lampa.Lang.translate('filmix_online_choose')]);

            this.loading(false);
        };

        /* ---------- post ---------- */

        this.load = function (id) {
            this.reset();
            this.loading(true);

            api.post(id, function (post) {
                if (!post || !post.player_links) return self.empty(Lampa.Lang.translate('filmix_online_error'));

                saveFilmixId(id);

                data = self.normalize(post.player_links);

                var hasSerial = data.seasons.length > 0;

                if (hasSerial) serial = true;

                if (!hasSerial && !data.movie.length) return self.empty(Lampa.Lang.translate('filmix_online_empty'));

                seasons = data.seasons.map(function (s) {
                    return s.season;
                });

                if (choice.season >= seasons.length) choice.season = 0;

                self.refresh();
            }, this.failed);
        };

        this.normalize = function (links) {
            var result = { movie: [], seasons: [] };

            (links.movie || []).forEach(function (m) {
                if (isBlocked(m.translation, m.link)) return;

                var qualities = linkQualities(m.link, m.qualities);

                if (Object.keys(qualities).length) result.movie.push({ name: m.translation || 'Оригинал', qualities: qualities });
            });

            var playlist = links.playlist && !Array.isArray(links.playlist) ? links.playlist : {};

            numericKeys(playlist).forEach(function (seasonKey) {
                var voicesObj = playlist[seasonKey] || {};
                var voices = [];

                Object.keys(voicesObj).forEach(function (voiceName) {
                    if (isBlocked(voiceName)) return;

                    var episodesObj = voicesObj[voiceName] || {};
                    var episodes = [];

                    numericKeys(episodesObj).forEach(function (epKey) {
                        var ep = episodesObj[epKey] || {};
                        var qualities = linkQualities(ep.link, ep.qualities);

                        if (!isBlocked('', ep.link) && Object.keys(qualities).length) {
                            episodes.push({ episode: parseInt(epKey, 10) || episodes.length + 1, qualities: qualities });
                        }
                    });

                    if (episodes.length) voices.push({ name: voiceName, episodes: episodes });
                });

                if (voices.length) result.seasons.push({ season: parseInt(seasonKey, 10) || 1, voices: voices });
            });

            return result;
        };

        this.voices = function () {
            return serial ? data.seasons[choice.season].voices : data.movie;
        };

        // keep the previously chosen voice by name, since the voice list differs between seasons
        this.selectVoice = function () {
            var voices = this.voices();
            var index = -1;

            if (choice.voice_name) {
                voices.forEach(function (v, i) {
                    if (index == -1 && v.name == choice.voice_name) index = i;
                });
            }

            if (index == -1) index = choice.voice < voices.length ? choice.voice : 0;

            choice.voice = index;
            choice.voice_name = voices[index].name;

            saveChoice();
        };

        this.refresh = function () {
            this.selectVoice();
            this.buildFilter();

            if (serial) {
                this.loadEpisodesInfo(seasons[choice.season], function () {
                    self.display();
                });
            }
            else this.display();
        };

        this.loadEpisodesInfo = function (season, call) {
            episodesInfo = [];

            if (!season || typeof object.movie.id !== 'number' || !Lampa.Api || !Lampa.Api.sources || !Lampa.Api.sources.tmdb) return call();

            Lampa.Api.sources.tmdb.get('tv/' + object.movie.id + '/season/' + season, {}, function (json) {
                episodesInfo = (json && json.episodes) || [];
                call();
            }, function () {
                call();
            });
        };

        this.buildFilter = function () {
            var select = [{ title: Lampa.Lang.translate('torrent_parser_reset'), reset: true }];
            var chosen = [];

            if (serial) {
                var voices = this.voices();
                var voiceTitle = Lampa.Lang.translate('torrent_parser_voice');
                var seasonTitle = Lampa.Lang.translate('torrent_serial_season');

                select.push({
                    title: voiceTitle,
                    subtitle: voices[choice.voice].name,
                    stype: 'voice',
                    items: voices.map(function (v, i) {
                        return { title: v.name, selected: i == choice.voice, index: i };
                    })
                });

                select.push({
                    title: seasonTitle,
                    subtitle: seasonTitle + ' ' + seasons[choice.season],
                    stype: 'season',
                    items: seasons.map(function (n, i) {
                        return { title: seasonTitle + ' ' + n, selected: i == choice.season, index: i };
                    })
                });

                chosen.push(voiceTitle + ': ' + voices[choice.voice].name);
                chosen.push(seasonTitle + ': ' + seasons[choice.season]);
            }

            filter.set('filter', select);
            filter.chosen('filter', chosen);
        };

        /* ---------- list ---------- */

        this.buildItems = function () {
            var original = object.movie.original_title || object.movie.original_name || object.movie.title || object.movie.name || '';

            if (!serial) {
                return data.movie.map(function (voice, i) {
                    return {
                        num: i + 1,
                        title: voice.name,
                        info: '',
                        qualities: voice.qualities,
                        voice_name: voice.name,
                        hash: Lampa.Utils.hash(original),
                        hash_view: Lampa.Utils.hash(original + voice.name)
                    };
                });
            }

            var season = seasons[choice.season];
            var voice = this.voices()[choice.voice];

            return voice.episodes.map(function (ep) {
                var info = episodesInfo.filter(function (e) {
                    return e.episode_number == ep.episode;
                })[0];

                return {
                    num: ep.episode,
                    season: season,
                    episode: ep.episode,
                    title: info && info.name ? info.name : Lampa.Lang.translate('filmix_online_episode') + ' ' + ep.episode,
                    info: info && info.air_date ? Lampa.Utils.parseTime(info.air_date).full : '',
                    qualities: ep.qualities,
                    voice_name: voice.name,
                    hash: Lampa.Utils.hash([season, ep.episode, original].join('')),
                    hash_view: Lampa.Utils.hash([season, ep.episode, original, voice.name].join(''))
                };
            });
        };

        this.display = function () {
            var items = this.buildItems();
            var viewed = Lampa.Storage.cache('online_view', 5000, []);
            var focus = false;
            var lastEpisode = serial ? choice.episodes_view[seasons[choice.season]] : null;

            this.reset();

            items.forEach(function (item) {
                var html = Lampa.Template.get('filmix_online_item', {
                    num: item.num,
                    title: escapeHtml(item.title),
                    info: escapeHtml(item.info),
                    quality: bestLabel(item.qualities)
                });

                item.timeline = Lampa.Timeline.view(item.hash);

                html.find('.fxo-item__timeline').append(Lampa.Timeline.render(item.timeline));

                if (viewed.indexOf(item.hash_view) !== -1) html.addClass('fxo-item--viewed');

                if (serial && lastEpisode == item.episode) focus = html;

                item.mark = function () {
                    viewed = Lampa.Storage.cache('online_view', 5000, []);

                    if (viewed.indexOf(item.hash_view) == -1) {
                        viewed.push(item.hash_view);
                        Lampa.Storage.set('online_view', viewed);
                    }

                    html.addClass('fxo-item--viewed');

                    if (serial) {
                        choice.episodes_view[item.season] = item.episode;
                        saveChoice();
                    }
                };

                html.on('hover:enter', function () {
                    if (object.movie.id) Lampa.Favorite.add('history', object.movie, 100);

                    self.play(item, items);
                }).on('hover:focus', function (e) {
                    last = e.target;
                    scroll.update($(e.target), true);
                }).on('hover:long', function () {
                    self.contextMenu(item, items);
                });

                scroll.append(html);
            });

            if (focus) last = focus[0];

            this.loading(false);
        };

        this.toPlayer = function (item) {
            return {
                title: serial ? (object.movie.name || '') + ' / ' + item.title : (object.movie.title || '') + ' / ' + item.voice_name,
                url: pickUrl(item.qualities),
                quality: sortQualities(item.qualities),
                timeline: item.timeline,
                callback: item.mark
            };
        };

        this.play = function (item, items) {
            var first = this.toPlayer(item);

            if (!first.url) return Lampa.Noty.show(Lampa.Lang.translate('filmix_online_empty'));

            var playlist = serial ? items.map(function (el) {
                return el === item ? first : self.toPlayer(el);
            }) : [first];

            if (playlist.length > 1) first.playlist = playlist;

            Lampa.Player.play(first);
            Lampa.Player.playlist(playlist);

            item.mark();
        };

        this.contextMenu = function (item, items) {
            var enabled = Lampa.Controller.enabled().name;
            var menu = [];

            if (Lampa.Platform.is('android')) menu.push({ title: Lampa.Lang.translate('player_lauch') + ' - Android', player: 'android' });

            menu.push({ title: Lampa.Lang.translate('player_lauch') + ' - Lampa', player: 'lampa' });

            Object.keys(sortQualities(item.qualities)).forEach(function (q) {
                menu.push({ title: Lampa.Lang.translate('copy_link') + ' ' + q, copy: item.qualities[q] });
            });

            Lampa.Select.show({
                title: Lampa.Lang.translate('title_action'),
                items: menu,
                onBack: function () {
                    Lampa.Controller.toggle(enabled);
                },
                onSelect: function (a) {
                    Lampa.Controller.toggle(enabled);

                    if (a.player) {
                        Lampa.Player.runas(a.player);
                        self.play(item, items);
                    }

                    if (a.copy) {
                        Lampa.Utils.copyTextToClipboard(a.copy, function () {
                            Lampa.Noty.show(Lampa.Lang.translate('copy_secuses'));
                        }, function () {
                            Lampa.Noty.show(Lampa.Lang.translate('copy_error'));
                        });
                    }
                }
            });
        };

        this.failed = function (a, c) {
            self.empty(Lampa.Lang.translate('filmix_online_error') + (network.errorDecode ? ': ' + escapeHtml(network.errorDecode(a, c)) : ''));
        };

        this.empty = function (text) {
            this.reset();

            var html = Lampa.Template.get('filmix_online_empty', { text: text });

            html.on('hover:focus', function (e) {
                last = e.target;
            });

            scroll.append(html);

            this.loading(false);
        };

        this.reset = function () {
            last = false;

            network.clear();
            scroll.clear();
        };

        this.loading = function (status) {
            if (status) this.activity.loader(true);
            else {
                this.activity.loader(false);
                this.activity.toggle();
            }
        };

        this.start = function () {
            if (Lampa.Activity.active().activity !== this.activity) return;

            if (!initialized) {
                initialized = true;
                this.initialize();
            }

            Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(object.movie));

            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render(), files.render());
                    Lampa.Controller.collectionFocus(last || false, scroll.render());
                },
                up: function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function () {
                    Navigator.move('down');
                },
                right: function () {
                    if (Navigator.canmove('right')) Navigator.move('right');
                    else filter.show(Lampa.Lang.translate('title_filter'), 'filter');
                },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                back: this.back
            });

            Lampa.Controller.toggle('content');
        };

        this.back = function () {
            Lampa.Activity.backward();
        };

        this.pause = function () {};

        this.stop = function () {};

        this.destroy = function () {
            network.clear();
            files.destroy();
            scroll.destroy();
        };
    }

    /* ---------------- settings ---------------- */

    var ICON = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="20" height="20" rx="4" stroke="currentColor" stroke-width="2"/><path d="M8.5 17.5V8.6c0-1.2.9-2.1 2.1-2.1h4.4M8.5 12h5.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    function addSettings() {
        if (!Lampa.SettingsApi) return;

        Lampa.SettingsApi.addComponent({
            component: COMPONENT,
            name: 'Filmix',
            icon: ICON
        });

        [
            ['filmix_online_proxy', 'filmix_online_proxy_title', 'filmix_online_proxy_descr', 'https://lampa-zetflix.you.workers.dev'],
            ['filmix_online_proxy_token', 'filmix_online_proxy_token_title', 'filmix_online_proxy_token_descr', ''],
            ['filmix_online_user_token', 'filmix_online_user_token_title', 'filmix_online_user_token_descr', '']
        ].forEach(function (p) {
            Lampa.SettingsApi.addParam({
                component: COMPONENT,
                param: { name: p[0], type: 'input', values: '', default: '', placeholder: p[3] },
                field: { name: Lampa.Lang.translate(p[1]), description: Lampa.Lang.translate(p[2]) }
            });
        });
    }

    /* ---------------- entry points ---------------- */

    function open(movie) {
        Lampa.Activity.push({
            url: '',
            title: 'Filmix',
            component: COMPONENT,
            search: movie.title || movie.name,
            movie: movie,
            page: 1
        });
    }

    var buttonHtml = '<div class="full-start__button selector view--filmix-online" data-subtitle="Filmix v' + VERSION + '">' +
        ICON +
        '<span>Filmix</span>' +
        '</div>';

    function startPlugin() {
        Lampa.Component.add(COMPONENT, component);

        Lampa.Manifest.plugins = {
            type: 'video',
            version: VERSION,
            name: 'Filmix',
            description: 'Онлайн просмотр с Filmix',
            component: COMPONENT,
            onContextMenu: function () {
                return { name: Lampa.Lang.translate('filmix_online_watch'), description: '' };
            },
            onContextLauch: function (movie) {
                open(movie);
            }
        };

        Lampa.Listener.follow('full', function (e) {
            if (e.type !== 'complite') return;

            var render = e.object.activity.render();

            if (render.find('.view--filmix-online').length) return;

            var btn = $(buttonHtml);

            btn.on('hover:enter', function () {
                open(e.data.movie);
            });

            var torrent = render.find('.view--torrent');

            if (torrent.length) torrent.after(btn);
            else render.find('.full-start-new__buttons, .full-start__buttons').first().append(btn);
        });

        addSettings();
    }

    if (window.appready) startPlugin();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type == 'ready') startPlugin();
        });
    }
})();
