define([
    '/common/common-hash.js',
    '/common/common-util.js',
    '/common/userObject.js',

    '/bower_components/nthen/index.js',
    '/bower_components/chainpad-crypto/crypto.js',
    '/bower_components/chainpad-listmap/chainpad-listmap.js',
    '/bower_components/chainpad/chainpad.dist.js',
], function (Hash, Util, UserObject,
             nThen, Crypto, Listmap, ChainPad) {
    var SF = {};

    /* load
        create and load a proxy using listmap for a given shared folder
        - config: network and "manager" (either the user one or a team manager)
        - id: shared folder id
    */

    var allSharedFolders = {};

    // No version: visible edit
    // Version 2: encrypted edit links
    SF.checkMigration = function (secondaryKey, proxy, uo, cb) {
        if (true) { // XXX remove this block to enable migration at load time
            // FIXME history
            return void cb();
        }
        var drive = proxy.drive || proxy;
        // View access: can't migrate
        if (!secondaryKey) { return void cb(); }
        // Already migrated: nothing to do
        if (drive.version >= 2) { return void cb(); }
        // Not yet migrating: migrate
        if (!drive.migrateRo) { return void uo.migrateReadOnly(cb); }
        // Already migrating: wait for the end...
        var done = false;
        var to;
        var it = setInterval(function () {
            if (drive.version >= 2) {
                done = true;
                clearTimeout(to);
                clearInterval(it);
                return void cb();
            }
        }, 100);
        to = setTimeout(function () {
            clearInterval(it);
            uo.migrateReadOnly(function () {
                done = true;
                cb();
            });
        }, 20000);
        var path = proxy.drive ? ['drive', 'version'] : ['version'];
        proxy.on('change', path, function () {
            if (done) { return; }
            if (drive.version >= 2) {
                done = true;
                clearTimeout(to);
                clearInterval(it);
                cb();
            }
        });
    };

    SF.load = function (config, id, data, _cb) {
        var cb = Util.once(_cb);
        var network = config.network;
        var store = config.store;
        var isNew = config.isNew;
        var isNewChannel = config.isNewChannel;
        var teamId = store.id;
        var handler = store.handleSharedFolder;

        var href = store.manager.user.userObject.getHref(data);

        var parsed = Hash.parsePadUrl(href);
        var secret = Hash.getSecrets('drive', parsed.hash, data.password);
        var secondaryKey = secret.keys.secondaryKey;

        // If we try to load an existing shared folder (isNew === false) but this folder
        // doesn't exist in the database, abort and cb
        nThen(function (waitFor) {
            isNewChannel(null, { channel: secret.channel }, waitFor(function (obj) {
                if (obj.isNew && !isNew) {
                    store.manager.deprecateProxy(id, secret.channel);
                    waitFor.abort();
                    return void cb(null);
                }
            }));
        }).nThen(function () {
            var sf = allSharedFolders[secret.channel];
            if (sf && sf.readOnly && secondaryKey) {
                // We were in readOnly mode and now we know the edit keys!
                SF.upgrade(secret.channel, secret);
            }
            if (sf && sf.ready && sf.rt) {
                // The shared folder is already loaded, return its data
                setTimeout(function () {
                    var leave = function () { SF.leave(secret.channel, teamId); };
                    var uo = store.manager.addProxy(id, sf.rt, leave, secondaryKey);
                    SF.checkMigration(secondaryKey, sf.rt.proxy, uo, function () {
                        cb(sf.rt, sf.metadata);
                    });
                });
                sf.teams.push({
                    cb: cb,
                    store: store,
                    id: id
                });
                if (handler) { handler(id, sf.rt); }
                return;
            }
            if (sf && !sf.ready && sf.rt) {
                // The shared folder is loading, add our callbacks to the queue
                sf.teams.push({
                    cb: cb,
                    store: store,
                    secondaryKey: secondaryKey,
                    id: id
                });
                if (handler) { handler(id, sf.rt); }
                return;
            }

            sf = allSharedFolders[secret.channel] = {
                teams: [{
                    cb: cb,
                    store: store,
                    secondaryKey: secondaryKey,
                    id: id
                }],
                readOnly: !Boolean(secondaryKey)
            };

            var owners = data.owners;
            var listmapConfig = {
                data: {},
                channel: secret.channel,
                readOnly: !Boolean(secondaryKey),
                crypto: Crypto.createEncryptor(secret.keys),
                userName: 'sharedFolder',
                logLevel: 1,
                ChainPad: ChainPad,
                classic: true,
                network: network,
                metadata: {
                    validateKey: secret.keys.validateKey || undefined,
                    owners: owners
                }
            };
            var rt = sf.rt = Listmap.create(listmapConfig);
            rt.proxy.on('ready', function (info) {
                if (isNew && !Object.keys(rt.proxy).length) {
                    // New Shared folder: no migration required
                    rt.proxy.version = 2;
                }
                if (!sf.teams) {
                    return;
                }
                sf.teams.forEach(function (obj) {
                    var leave = function () { SF.leave(secret.channel, teamId); };
                    var uo = obj.store.manager.addProxy(obj.id, rt, leave, obj.secondaryKey);
                    SF.checkMigration(secondaryKey, rt.proxy, uo, function () {
                        obj.cb(sf.rt, info.metadata);
                    });
                });
                sf.metadata = info.metadata;
                sf.ready = true;
            });
            rt.proxy.on('error', function (info) {
                if (info && info.error) {
                    if (info.error === "EDELETED" ) {
                        try {
                            // Deprecate the shared folder from each team
                            // We can only hide it
                            sf.teams.forEach(function (obj) {
                                obj.store.manager.deprecateProxy(obj.id, secret.channel);
                            });
                        } catch (e) {}
                        delete allSharedFolders[secret.channel];
                    }
                }
            });

            if (handler) { handler(id, rt); }
        });
    };


    SF.upgrade = function (channel, secret) {
        var sf = allSharedFolders[channel];
        if (!sf || !sf.readOnly) { return; }
        if (!sf.rt.setReadOnly) { return; }

        if (!secret.keys || !secret.keys.editKeyStr) { return; }
        var crypto = Crypto.createEncryptor(secret.keys);
        sf.readOnly = false;
        sf.rt.setReadOnly(false, crypto);
    };

    SF.leave = function (channel, teamId) {
        var sf = allSharedFolders[channel];
        if (!sf) { return; }
        var clients = sf.teams;
        if (!Array.isArray(clients)) { return; }
        var idx;
        clients.some(function (obj, i) {
            if (obj.store.id === teamId) {
                idx = i;
                return true;
            }
        });
        if (typeof (idx) === "undefined") { return; }
        // Remove the selected team
        clients.splice(idx, 1);

        //If all the teams have closed this shared folder, stop it
        if (clients.length) { return; }
        if (sf.rt && sf.rt.stop) {
            sf.rt.stop();
        }
    };

    // Update the password locally
    SF.updatePassword = function (Store, data, network, cb) {
        var oldChannel = data.oldChannel;
        var href = data.href;
        var password = data.password;
        var parsed = Hash.parsePadUrl(href);
        var secret = Hash.getSecrets(parsed.type, parsed.hash, password);
        var sf = allSharedFolders[oldChannel];
        if (!sf) { return void cb({ error: 'ENOTFOUND' }); }
        if (sf.rt && sf.rt.stop) {
            sf.rt.stop();
        }
        var nt = nThen;
        sf.teams.forEach(function (obj) {
            nt = nt(function (waitFor) {
                var s = obj.store;
                var sfId = obj.id;
                // We can't update the password of a shared folder in a read-only team
                if (s.manager.user.userObject.readOnly) {
                    // Just deprecate the folder so that inner can stop displaying a folder no longer available
                    if (s.manager.folders[sfId]) {
                        s.manager.folders[sfId].proxy = { deprecated: true };
                    }
                    return;
                }
                var shared = Util.find(s.proxy, ['drive', UserObject.SHARED_FOLDERS]) || {};
                if (!sfId || !shared[sfId]) { return; }
                var sf = JSON.parse(JSON.stringify(shared[sfId]));
                sf.password = password;
                SF.load({
                    network: network,
                    store: s,
                    isNewChannel: Store.isNewChannel
                }, sfId, sf, waitFor());
                if (!s.rpc) { return; }
                s.rpc.unpin([oldChannel], waitFor());
                s.rpc.pin([secret.channel], waitFor());
            }).nThen;
        });
        nt(function () {
            cb();
        });
    };

    /* loadSharedFolders
        load all shared folder stored in a given drive
        - store: user or team main store
        - userObject: userObject associated to the main drive
        - handler: a function (sfid, rt) called for each shared folder loaded
    */
    SF.loadSharedFolders = function (Store, network, store, userObject, waitFor) {
        var shared = Util.find(store.proxy, ['drive', UserObject.SHARED_FOLDERS]) || {};
        nThen(function (waitFor) {
            Object.keys(shared).forEach(function (id) {
                var sf = shared[id];
                SF.load({
                    network: network,
                    store: store,
                    isNewChannel: Store.isNewChannel
                }, id, sf, waitFor());
            });
        }).nThen(waitFor());
    };

    return SF;
});
