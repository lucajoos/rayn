(() => {
    window.addEventListener('load', () => {
        let currentLocation = window.location.href;
        let currentObserverCleanup = () => {};
        let previousObserverCleanup = () => {};

        if(!window?.io) {
            throw new Error('Socket.io not initialized globally');
        }

        const socket = window.io('http://127.0.0.1:4001');

        let observe = (selector, callback) => {
            let r = () => {};

            if(typeof selector === 'string' && typeof callback === 'function') {
                let observer = new MutationObserver((mutations, self) => {
                    let element = document.querySelector(selector);

                    if(!element) {
                        self.disconnect();
                    }

                    callback(element);
                });

                observer.observe(document.querySelector(selector), {
                    attributes: true
                });

                r = () => {
                    observer.disconnect();
                }
            }

            return r;
        }

        let detect = (selector, options) => {
            if(typeof selector === 'string') {
                return new Promise((rs, rj) => {
                    let ar = false;

                    if(typeof selector !== 'string') {
                        rj('No selector specified.');
                    }

                    let observer = new MutationObserver((mutations, self) => {
                        let element = document.querySelector(selector);

                        if(!options?.isInverted ? element : (!element && ar)) {
                            rs(element);
                            self.disconnect();
                            return true;
                        }

                        ar = true;
                    });

                    observer.observe(document, {
                        childList: true,
                        subtree: true
                    });

                    if(typeof options?.run === 'function') {
                        options?.run();
                    }
                });
            }
        };

        let resolve = async () => {
            let isRunning = true;

            let meta = {
                isResolved: false
            };

            if(
                window.location.href.startsWith('https://www.netflix.com/watch/')
            ) {
                const information = await detect('.ellipsize-text');
                let title;

                meta.additional = '';

                if(information.tagName === 'DIV') {
                    title = information.querySelector('h4');
                    meta.additional = [ ...information.querySelectorAll('span') ].map(element => element.innerHTML).join(' ');
                    meta.type = 1;
                } else {
                    title = information;
                    meta.type = 0;
                }

                meta.title = title.innerHTML || 'Unknown';
                meta.provider = 'Netflix';
                meta.isResolved = true;
            } else if(
                window.location.href.startsWith('https://www.disneyplus.com/video/')
            ) {
                await detect('video');

                const title = await detect('div.title-field', () => {
                    document.dispatchEvent(new Event('mousemove'));
                });

                meta.title = title.innerHTML || 'Unknown';
                meta.additional = document.querySelector('.subtitle-field')?.innerHTML || '';
                meta.type = document.querySelector('.subtitle-field')?.innerHTML ? 1 : 0;
                meta.provider = 'Disney+';
                meta.isResolved = true;
            } else if(
                window.location.href.startsWith('https://www.youtube.com/watch?v=')
            ) {
                const title = await detect('#container > h1 > yt-formatted-string');

                currentObserverCleanup = observe('.html5-video-player', element => {
                    if(element?.classList.contains('playing-mode') && !isRunning) {
                        isRunning = true;
                    } else if(element?.classList.contains('paused-mode') && isRunning) {
                        isRunning = false;
                    }
                });

                meta.title = title.textContent || 'Unknown';
                meta.additional = document.querySelector('#text > a').innerHTML || '';
                meta.type = 0;
                meta.provider = 'YouTube';
                meta.isResolved = true;
            } else if(
                window.location.href.startsWith('https://www.amazon.') &&
                document.title.startsWith('Amazon') &&
                document.title.endsWith('| Prime Video')
            ) {
                let r = async () => {
                    await detect('#dv-web-player.dv-player-fullscreen');

                    let title = await detect('div.title');

                    while (title.innerHTML?.length === 0) {
                        title = await detect('div.title');
                    }

                    meta.title = title.innerHTML || 'Unknown';
                    meta.additional = document.querySelector('.subtitle').innerHTML || '';
                    meta.type = document.querySelector('.subtitle')?.innerHTML ? 1 : 0;
                    meta.provider = 'Amazon Prime Video';
                    meta.isResolved = true;

                    socket.emit('resolve', {
                        href: window.location.href,
                        ...meta,
                    });

                    await detect('#dv-web-player.dv-player-fullscreen', {
                        isInverted: true
                    });

                    socket.emit('resolve', {
                        href: window.location.href,
                        isResolved: false
                    });

                    await r();
                };

                await r();
            }

            if(typeof previousObserverCleanup === 'function') {
                previousObserverCleanup();
                previousObserverCleanup = currentObserverCleanup;
            }

            socket.emit('resolve', {
                href: window.location.href,
                ...meta,
            });
        };

        socket.on('connect', () => {
            socket.emit('init', {
                type: 'extension'
            });

            setInterval(() => {
                if(currentLocation !== window.location.href) {
                    resolve();

                    currentLocation = window.location.href;
                }
            }, 2000);

            resolve();
        });
    });
})();