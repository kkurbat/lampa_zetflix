(function () {
    'use strict';

    if (window.zetflix_plugin) return;

    window.zetflix_plugin = true;

    var VERSION = '1.0.0';
    var COMPONENT = 'zetflix';

    var WIKIDATA = 'https://www.wikidata.org/w/api.php';
    var KP_UNOFFICIAL = 'https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=';

    /* ---------------- lang ---------------- */

    Lampa.Lang.add({
        zetflix_watch: {
            ru: 'Смотреть на Zetflix',
            uk: 'Дивитися на Zetflix',
            en: 'Watch on Zetflix'
        },
        zetflix_proxy_title: {
            ru: 'Адрес прокси',
            uk: 'Адреса проксі',
            en: 'Proxy URL'
        },
        zetflix_proxy_descr: {
            ru: 'Worker / сервер из папки proxy, например https://lampa-zetflix.you.workers.dev',
            uk: 'Worker / сервер з папки proxy, наприклад https://lampa-zetflix.you.workers.dev',
            en: 'Worker / server from the proxy folder, e.g. https://lampa-zetflix.you.workers.dev'
        },
        zetflix_token_title: {
            ru: 'Токен прокси',
            uk: 'Токен проксі',
            en: 'Proxy token'
        },
        zetflix_token_descr: {
            ru: 'Если на прокси задан TOKEN',
            uk: 'Якщо на проксі задано TOKEN',
            en: 'If TOKEN is set on the proxy'
        },
        zetflix_kpkey_title: {
            ru: 'Ключ kinopoiskapiunofficial.tech',
            uk: 'Ключ kinopoiskapiunofficial.tech',
            en: 'kinopoiskapiunofficial.tech key'
        },
        zetflix_kpkey_descr: {
            ru: 'Необязательно. Поиск ID Кинопоиска по названию, если Wikidata не знает фильм',
            uk: 'Необовʼязково. Пошук ID Кінопошуку за назвою, якщо Wikidata не знає фільм',
            en: 'Optional. Kinopoisk ID lookup by title when Wikidata has no match'
        },
        zetflix_no_proxy: {
            ru: 'Укажите адрес прокси в Настройки → Zetflix',
            uk: 'Вкажіть адресу проксі в Налаштування → Zetflix',
            en: 'Set the proxy URL in Settings → Zetflix'
        },
        zetflix_no_kp: {
            ru: 'Не удалось определить ID Кинопоиска. Введите его в поиске фильтра',
            uk: 'Не вдалося визначити ID Кінопошуку. Введіть його в пошуку фільтра',
            en: 'Kinopoisk ID not found. Enter it in the filter search'
        },
        zetflix_not_found: {
            ru: 'На Zetflix ничего не найдено',
            uk: 'На Zetflix нічого не знайдено',
            en: 'Nothing found on Zetflix'
        },
        zetflix_error: {
            ru: 'Ошибка прокси',
            uk: 'Помилка проксі',
            en: 'Proxy error'
        },
        zetflix_episode: {
            ru: 'Серия',
            uk: 'Серія',
            en: 'Episode'
        }
    });

    /* ---------------- templates ---------------- */

    Lampa.Template.add('zetflix_css', '<style>' +
        '.zetflix-item{display:flex;align-items:center;padding:1em 1.2em;margin-bottom:0.6em;background-color:rgba(0,0,0,0.3);border-radius:0.6em}' +
        '.zetflix-item.focus{background-color:#fff;color:#000}' +
        '.zetflix-item__num{flex-shrink:0;width:2.6em;font-size:1.6em;font-weight:600;opacity:0.6}' +
        '.zetflix-item__body{flex-grow:1;min-width:0}' +
        '.zetflix-item__title{font-size:1.3em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.zetflix-item__info{margin-top:0.3em;opacity:0.6;font-size:0.95em}' +
        '.zetflix-item__timeline{margin-top:0.5em}' +
        '.zetflix-item__timeline:empty{display:none}' +
        '.zetflix-item__quality{flex-shrink:0;margin-left:1em;padding:0.2em 0.5em;border:1px solid currentColor;border-radius:0.3em;font-size:0.9em}' +
        '.zetflix-item__quality:empty{display:none}' +
        '.zetflix-item--viewed .zetflix-item__num{opacity:0.25}' +
        '.zetflix-empty{padding:2em 1em;text-align:center;opacity:0.7;font-size:1.2em}' +
        '</style>');

    Lampa.Template.add('zetflix_item',
        '<div class="zetflix-item selector">' +
            '<div class="zetflix-item__num">{num}</div>' +
            '<div class="zetflix-item__body">' +
                '<div class="zetflix-item__title">{title}</div>' +
                '<div class="zetflix-item__info">{info}</div>' +
                '<div class="zetflix-item__timeline"></div>' +
            '</div>' +
            '<div class="zetflix-item__quality">{quality}</div>' +
        '</div>');

    Lampa.Template.add('zetflix_empty', '<div class="zetflix-empty selector">{text}</div>');

    $('body').append(Lampa.Template.get('zetflix_css', {}, true));

    /* ---------------- helpers ---------------- */

    function proxyUrl() {
        var url = (Lampa.Storage.get('zetflix_proxy', '') + '').trim();

        if (url && !/^https?:\/\//.test(url)) url = 'https://' + url;

        return url.replace(/\/+$/, '');
    }

    function escapeHtml(str) {
        return (str + '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function isSerial(movie) {
        return !!(movie.name || movie.original_name || movie.number_of_seasons);
    }

    function qualityNumber(label) {
        return parseInt(label, 10) || 0;
    }

    // quality map for Lampa player, best first
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

    /* ---------------- kinopoisk id ---------------- */

    function KpResolver(network) {
        var cache = Lampa.Storage.cache('zetflix_kp', 1000, {});

        function cacheKey(movie) {
            return (isSerial(movie) ? 'tv_' : 'movie_') + movie.id;
        }

        this.save = function (movie, kp) {
            cache = Lampa.Storage.cache('zetflix_kp', 1000, {});
            cache[cacheKey(movie)] = kp;

            Lampa.Storage.set('zetflix_kp', cache);
        };

        this.resolve = function (movie, done) {
            var self = this;
            var direct = movie.kinopoisk_id || movie.kp_id;

            if (direct) return done(direct + '');

            if (cache[cacheKey(movie)]) return done(cache[cacheKey(movie)]);

            // Wikidata: TMDB id (P4947 movie / P4983 tv) or IMDb id (P345) -> Kinopoisk film id (P2603)
            var claims = [];

            if (movie.id && /^\d+$/.test(movie.id + '') && (!movie.source || movie.source == 'tmdb' || movie.source == 'cub')) {
                claims.push((isSerial(movie) ? 'P4983' : 'P4947') + '=' + movie.id);
            }

            if (movie.imdb_id) claims.push('P345=' + movie.imdb_id);

            var next = function () {
                if (!claims.length) {
                    return searchByTitle(movie, function (kp) {
                        if (kp) self.save(movie, kp);

                        done(kp);
                    });
                }

                wikidata(claims.shift(), function (kp) {
                    if (kp) {
                        self.save(movie, kp);
                        done(kp);
                    }
                    else next();
                });
            };

            next();
        };

        function wikidata(claim, done) {
            var search = WIKIDATA + '?action=query&list=search&srlimit=1&srprop=&format=json&origin=*&srsearch=' + encodeURIComponent('haswbstatement:' + claim);

            network.timeout(10000);
            network.silent(search, function (json) {
                var hit = json && json.query && json.query.search && json.query.search[0];

                if (!hit) return done(null);

                var entity = WIKIDATA + '?action=wbgetentities&props=claims&format=json&origin=*&ids=' + hit.title;

                network.timeout(10000);
                network.silent(entity, function (data) {
                    var item = data && data.entities && data.entities[hit.title];
                    var prop = item && item.claims && item.claims.P2603;
                    var value = prop && prop[0] && prop[0].mainsnak && prop[0].mainsnak.datavalue && prop[0].mainsnak.datavalue.value;

                    done(value ? value + '' : null);
                }, function () {
                    done(null);
                });
            }, function () {
                done(null);
            });
        }

        function searchByTitle(movie, done) {
            var key = (Lampa.Storage.get('zetflix_kp_key', '') + '').trim();
            var title = movie.title || movie.name;
            var year = ((movie.release_date || movie.first_air_date || '') + '').slice(0, 4);

            if (!key || !title) return done(null);

            network.timeout(10000);
            network.silent(KP_UNOFFICIAL + encodeURIComponent(title), function (json) {
                var films = (json && json.films) || [];
                var match = films.filter(function (f) {
                    return !year || (f.year + '').slice(0, 4) == year;
                })[0];

                done(match ? match.filmId + '' : null);
            }, function () {
                done(null);
            }, false, {
                headers: { 'X-API-KEY': key }
            });
        }
    }

    /* ---------------- component ---------------- */

    function component(object) {
        var self = this;
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);
        var resolver = new KpResolver(network);

        var serial = isSerial(object.movie);
        var initialized = false;
        var last = false;
        var kp = '';
        var data = null;
        var seasons = [];
        var episodesInfo = [];

        var choice = getChoice();

        function getChoice() {
            var all = Lampa.Storage.cache('zetflix_choice', 3000, {});
            var saved = all[object.movie.id] || {};

            return {
                season: saved.season || 0,
                voice: saved.voice || 0,
                voice_name: saved.voice_name || '',
                episodes_view: saved.episodes_view || {}
            };
        }

        function saveChoice() {
            var all = Lampa.Storage.cache('zetflix_choice', 3000, {});

            all[object.movie.id] = choice;

            Lampa.Storage.set('zetflix_choice', all);
        }

        function buildSeasons() {
            var list = [];

            (object.movie.seasons || []).forEach(function (s) {
                if (s.season_number > 0 && s.episode_count !== 0) list.push(s.season_number);
            });

            if (!list.length && object.movie.number_of_seasons) {
                for (var i = 1; i <= object.movie.number_of_seasons; i++) list.push(i);
            }

            if (!list.length) list.push(1);

            return list;
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

            // manual Kinopoisk ID through the filter search field
            filter.onSearch = function (value) {
                var id = (value + '').replace(/\D/g, '');

                if (!id) return;

                kp = id;
                resolver.save(object.movie, id);

                self.load();
            };

            filter.onSelect = function (type, a, b) {
                if (type !== 'filter') return;

                if (a.reset) {
                    choice.season = 0;
                    choice.voice = 0;
                    choice.voice_name = '';

                    saveChoice();
                    self.load();
                }
                else if (a.stype == 'season') {
                    choice.season = b.index;

                    saveChoice();
                    self.load();
                }
                else if (a.stype == 'voice') {
                    choice.voice = b.index;
                    choice.voice_name = data.voices[b.index].name;

                    saveChoice();
                    self.buildFilter();
                    self.display();
                }
            };

            if (filter.addButtonBack) filter.addButtonBack();

            filter.render().find('.filter--sort').remove();

            files.appendFiles(scroll.render());
            files.appendHead(filter.render());

            scroll.body().addClass('torrent-list');
            scroll.minus(files.render().find('.explorer__files-head'));

            this.search();
        };

        this.search = function () {
            this.loading(true);

            if (serial) seasons = buildSeasons();

            if (choice.season >= seasons.length) choice.season = 0;

            if (!proxyUrl()) return this.empty(Lampa.Lang.translate('zetflix_no_proxy'));

            resolver.resolve(object.movie, function (id) {
                if (!id) return self.empty(Lampa.Lang.translate('zetflix_no_kp'));

                kp = id;

                self.load();
            });
        };

        this.load = function () {
            var url = proxyUrl() + '/?kp=' + encodeURIComponent(kp);
            var token = (Lampa.Storage.get('zetflix_token', '') + '').trim();
            var season = serial ? seasons[choice.season] : 0;

            if (season) url += '&season=' + season;
            if (token) url += '&token=' + encodeURIComponent(token);

            this.reset();
            this.loading(true);

            network.timeout(30000);
            network.silent(url, function (json) {
                if (!json || !json.ok) {
                    var notFound = json && json.error == 'not_found';

                    data = null;

                    self.buildFilter();

                    return self.empty(notFound ? Lampa.Lang.translate('zetflix_not_found') : Lampa.Lang.translate('zetflix_error') + ': ' + escapeHtml(json && json.error || ''));
                }

                data = json;

                // a card without TMDB season info can still turn out to be a serial
                if (json.type == 'serial' && !serial) {
                    serial = true;
                    seasons = [json.season || 1];
                }

                if (!data.voices.length) {
                    self.buildFilter();

                    return self.empty(Lampa.Lang.translate('zetflix_not_found'));
                }

                self.selectVoice();
                self.buildFilter();

                if (serial) {
                    self.loadEpisodesInfo(season, function () {
                        self.display();
                    });
                }
                else self.display();
            }, function (a, c) {
                self.empty(Lampa.Lang.translate('zetflix_error') + ': ' + escapeHtml(network.errorDecode ? network.errorDecode(a, c) : ''));
            });
        };

        // keep the previously chosen voice by name, since indexes differ between seasons
        this.selectVoice = function () {
            var index = -1;

            if (choice.voice_name) {
                data.voices.forEach(function (v, i) {
                    if (index == -1 && v.name == choice.voice_name) index = i;
                });
            }

            if (index == -1) index = choice.voice < data.voices.length ? choice.voice : 0;

            choice.voice = index;
            choice.voice_name = data.voices[index].name;

            saveChoice();
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
            var select = [];
            var chosen = [];

            select.push({
                title: Lampa.Lang.translate('torrent_parser_reset'),
                reset: true
            });

            if (data && data.voices.length && serial) {
                var voiceTitle = Lampa.Lang.translate('torrent_parser_voice');

                select.push({
                    title: voiceTitle,
                    subtitle: data.voices[choice.voice].name,
                    stype: 'voice',
                    items: data.voices.map(function (v, i) {
                        return { title: v.name, selected: i == choice.voice, index: i };
                    })
                });

                chosen.push(voiceTitle + ': ' + data.voices[choice.voice].name);
            }

            if (serial && seasons.length) {
                var seasonTitle = Lampa.Lang.translate('torrent_serial_season');

                select.push({
                    title: seasonTitle,
                    subtitle: seasonTitle + ' ' + seasons[choice.season],
                    stype: 'season',
                    items: seasons.map(function (n, i) {
                        return { title: seasonTitle + ' ' + n, selected: i == choice.season, index: i };
                    })
                });

                chosen.push(seasonTitle + ': ' + seasons[choice.season]);
            }

            filter.set('filter', select);
            filter.chosen('filter', chosen);
        };

        /* ---------- list ---------- */

        this.buildItems = function () {
            var original = object.movie.original_title || object.movie.original_name || object.movie.title || object.movie.name || '';

            if (!serial) {
                return data.voices.map(function (voice, i) {
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
            var voice = data.voices[choice.voice];

            return voice.episodes.map(function (ep) {
                var info = episodesInfo.filter(function (e) {
                    return e.episode_number == ep.episode;
                })[0];

                return {
                    num: ep.episode,
                    season: season,
                    episode: ep.episode,
                    title: info && info.name ? info.name : Lampa.Lang.translate('zetflix_episode') + ' ' + ep.episode,
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
                var html = Lampa.Template.get('zetflix_item', {
                    num: item.num,
                    title: escapeHtml(item.title),
                    info: escapeHtml(item.info),
                    quality: bestLabel(item.qualities)
                });

                item.timeline = Lampa.Timeline.view(item.hash);

                html.find('.zetflix-item__timeline').append(Lampa.Timeline.render(item.timeline));

                if (viewed.indexOf(item.hash_view) !== -1) html.addClass('zetflix-item--viewed');

                if (serial && lastEpisode == item.episode) focus = html;

                item.mark = function () {
                    viewed = Lampa.Storage.cache('online_view', 5000, []);

                    if (viewed.indexOf(item.hash_view) == -1) {
                        viewed.push(item.hash_view);
                        Lampa.Storage.set('online_view', viewed);
                    }

                    html.addClass('zetflix-item--viewed');

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
                    self.contextMenu(item);
                });

                scroll.append(html);
            });

            if (focus) last = focus[0];

            this.loading(false);
        };

        this.toPlayer = function (item) {
            return {
                title: serial ? object.movie.name + ' / ' + item.title : (object.movie.title || '') + ' / ' + item.voice_name,
                url: pickUrl(item.qualities),
                quality: sortQualities(item.qualities),
                timeline: item.timeline,
                callback: item.mark
            };
        };

        this.play = function (item, items) {
            var first = this.toPlayer(item);

            if (!first.url) return Lampa.Noty.show(Lampa.Lang.translate('zetflix_not_found'));

            var playlist = serial ? items.map(function (el) {
                return el === item ? first : self.toPlayer(el);
            }) : [first];

            if (playlist.length > 1) first.playlist = playlist;

            Lampa.Player.play(first);
            Lampa.Player.playlist(playlist);

            item.mark();
        };

        this.contextMenu = function (item) {
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
                        self.play(item, self.buildItems().map(function (el) {
                            return el.hash == item.hash ? item : el;
                        }));
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

        this.empty = function (text) {
            this.reset();

            var html = Lampa.Template.get('zetflix_empty', { text: text });

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

    function addSettings() {
        if (!Lampa.SettingsApi) return;

        Lampa.SettingsApi.addComponent({
            component: COMPONENT,
            name: 'Zetflix',
            icon: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="20" height="20" rx="4" stroke="currentColor" stroke-width="2"/><path d="M7 7h10L7 17h10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT,
            param: { name: 'zetflix_proxy', type: 'input', values: '', default: '', placeholder: 'https://lampa-zetflix.you.workers.dev' },
            field: { name: Lampa.Lang.translate('zetflix_proxy_title'), description: Lampa.Lang.translate('zetflix_proxy_descr') }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT,
            param: { name: 'zetflix_token', type: 'input', values: '', default: '', placeholder: '' },
            field: { name: Lampa.Lang.translate('zetflix_token_title'), description: Lampa.Lang.translate('zetflix_token_descr') }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT,
            param: { name: 'zetflix_kp_key', type: 'input', values: '', default: '', placeholder: '' },
            field: { name: Lampa.Lang.translate('zetflix_kpkey_title'), description: Lampa.Lang.translate('zetflix_kpkey_descr') }
        });
    }

    /* ---------------- entry points ---------------- */

    function open(movie) {
        Lampa.Activity.push({
            url: '',
            title: 'Zetflix',
            component: COMPONENT,
            search: movie.title || movie.name,
            movie: movie,
            page: 1
        });
    }

    var buttonHtml = '<div class="full-start__button selector view--zetflix" data-subtitle="Zetflix v' + VERSION + '">' +
        '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="20" height="20" rx="4" stroke="currentColor" stroke-width="2"/><path d="M7 7h10L7 17h10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '<span>Zetflix</span>' +
        '</div>';

    function startPlugin() {
        Lampa.Component.add(COMPONENT, component);

        Lampa.Manifest.plugins = {
            type: 'video',
            version: VERSION,
            name: 'Zetflix',
            description: 'Онлайн просмотр с Zetflix',
            component: COMPONENT,
            onContextMenu: function () {
                return { name: Lampa.Lang.translate('zetflix_watch'), description: '' };
            },
            onContextLauch: function (movie) {
                open(movie);
            }
        };

        Lampa.Listener.follow('full', function (e) {
            if (e.type !== 'complite') return;

            var render = e.object.activity.render();

            if (render.find('.view--zetflix').length) return;

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
