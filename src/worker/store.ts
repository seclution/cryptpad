import nacl from 'tweetnacl/nacl-fast';
import { Module } from './types';
import { TestModule, TestModuleObject } from './modules/test';
import * as Util from '../common/common-util.js';
import * as Hash from '../common/common-hash.js';
import * as Feedback from '../common/common-feedback.js';
import * as Realtime from '../common/common-realtime.js';
import * as Messaging from '../common/common-messaging.js';
import * as Constants from '../common/common-constants.js';
import * as Credential from '../common/common-credential.js';
import * as ProxyManager from '../common/proxy-manager.js';
import * as UO from '../common/user-object.js';
import * as UOSetter from '../common/user-object-setter.js';
import * as Pinpad from '../common/pinpad.js';
import * as PadTypes from '../common/pad-types.js';
import * as NetworkConfig from '../common/network-config.js';
import * as LoginBlock from '../common/login-block.js';
import * as Migrate from './components/migrate-user-object.js';
import * as Store from './async-store.js';


// Modules
import * as Mailbox from './modules/mailbox.js';
import * as Cursor from './modules/cursor.js';
import * as Support from './modules/support.js';
import * as Integration from './modules/integration.js';

import * as OnlyOffice from './modules/onlyoffice.js';
import * as Profile from './modules/profile.js';
import * as Team from './modules/team.js';
import * as Messenger from './modules/messenger.js';

import * as History from './modules/history.js';
import * as Calendar from './modules/calendar.js';

interface StoreConfig {
    ApiConfig: any,
    AppConfig: any,
    Broadcast: any,
    Messages: any
}


let start = (cfg: StoreConfig):void => {

    [
        Feedback,
        UO,
        Constants,
        ProxyManager,
        NetworkConfig,
        Migrate,
        LoginBlock,
        PadTypes,
        Credential,
        Cursor,
        Support,
        Calendar
    ].forEach(dep => {
        if (typeof(dep.setCustomize) === "function") {
            dep.setCustomize(cfg);
        }
    });

    const AppConfig = cfg.AppConfig;
    const ApiConfig = cfg.ApiConfig;

    let test = TestModule.init({
        emit: () => {}
    }, () => {
        console.log('Test initialized');
    });
    let b64 = test.toBase64('pewpewPEZPEZ');
    console.error(b64);
    console.error(AppConfig.minimumPasswordLength, AppConfig.degradedLimit);
    console.error(Hash.getSecrets);
    console.error(Util.mkEvent);
    console.error(Messaging.createData);
    console.log('UO & UOSetter:');
    console.error(UO.getDefaultName({type:'pad'}));
    console.error(UO.getDefaultName);
    console.error(UOSetter.init);
    console.error(ProxyManager.createInner);
    console.log('Pinpad');
    console.error(Pinpad.create);
    console.error(LoginBlock.getBlockUrl);
    console.error(Mailbox.init, Cursor.init, Support.init, Integration.init);
    console.error(Profile.init, OnlyOffice.init, Team.init, Messenger.init);
    console.error(History.init, Calendar.init);
    //Util.fetchApi(ApiConfig.httpUnsafeOrigin, 'config', true, console.error);
    //Util.fetchApi(ApiConfig.httpUnsafeOrigin, 'config', false, console.error);
    console.error(Store);
    let StoreObj = Store.create();
    console.error(StoreObj);
};

export {
    start
};
