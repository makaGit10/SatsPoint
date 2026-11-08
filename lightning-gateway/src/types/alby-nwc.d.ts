/**
 * Déclarations de types pour `@getalby/sdk` (sous-ensemble NWC réellement utilisé).
 *
 * Pourquoi : le paquet est publié avec `"type": "module"` mais ses fichiers `.d.ts` utilisent des
 * imports relatifs sans extension (`from "./nwc"`), que la résolution `NodeNext` ne peut pas suivre ;
 * les types retombaient alors en `any`. `src/portefeuilles/alby.ts` rattache donc le module réel à ce fichier
 * (typage seulement ; à l’exécution Node charge le vrai paquet).
 * Rattaché au module réel dans src/portefeuilles/alby.ts. Source : node_modules/@getalby/sdk/dist/nwc/{NWCClient,types}.d.ts (v5.1.2).
 */
export declare namespace nwc {
  interface NWCOptions {
    relayUrl: string;
    walletPubkey: string;
    secret?: string;
    lud16?: string;
  }

  type NewNWCClientOptions = {
    relayUrl?: string;
    secret?: string;
    walletPubkey?: string;
    nostrWalletConnectUrl?: string;
    lud16?: string;
  };

  class Nip47Error extends Error {
    code: string;
    constructor(message: string, code: string);
  }
  class Nip47NetworkError extends Nip47Error {}
  class Nip47WalletError extends Nip47Error {}
  class Nip47TimeoutError extends Nip47Error {}
  class Nip47PublishTimeoutError extends Nip47TimeoutError {}
  class Nip47ReplyTimeoutError extends Nip47TimeoutError {}
  class Nip47PublishError extends Nip47Error {}
  class Nip47ResponseDecodingError extends Nip47Error {}
  class Nip47ResponseValidationError extends Nip47Error {}
  class Nip47UnexpectedResponseError extends Nip47Error {}
  class Nip47UnsupportedEncryptionError extends Nip47Error {}

  type Nip47SingleMethod =
    | 'get_info'
    | 'get_balance'
    | 'get_budget'
    | 'make_invoice'
    | 'pay_invoice'
    | 'pay_keysend'
    | 'lookup_invoice'
    | 'list_transactions'
    | 'sign_message'
    | 'create_connection'
    | 'make_hold_invoice'
    | 'settle_hold_invoice'
    | 'cancel_hold_invoice';
  type Nip47MultiMethod = 'multi_pay_invoice' | 'multi_pay_keysend';
  type Nip47Method = Nip47SingleMethod | Nip47MultiMethod;
  type Nip47Capability = Nip47Method | 'notifications';

  type Nip47GetInfoResponse = {
    alias: string;
    color: string;
    pubkey: string;
    network: string;
    block_height: number;
    block_hash: string;
    methods: Nip47Method[];
    notifications?: Nip47NotificationType[];
    metadata?: unknown;
    lud16?: string;
  };

  type Nip47GetBalanceResponse = { balance: number };
  type Nip47PayResponse = { preimage: string; fees_paid: number };

  interface Nip47ListTransactionsRequest {
    from?: number;
    until?: number;
    limit?: number;
    offset?: number;
    unpaid?: boolean;
    unpaid_outgoing?: boolean;
    unpaid_incoming?: boolean;
    type?: 'incoming' | 'outgoing';
  }

  type Nip47ListTransactionsResponse = { transactions: Nip47Transaction[]; total_count: number };

  type Nip47TransactionMetadata = Record<string, unknown>;

  type Nip47Transaction = {
    type: 'incoming' | 'outgoing';
    state: 'settled' | 'pending' | 'failed';
    invoice: string;
    description: string;
    description_hash: string;
    preimage: string;
    payment_hash: string;
    amount: number;
    fees_paid: number;
    settled_at: number;
    created_at: number;
    expires_at: number;
    settle_deadline?: number;
    metadata?: Nip47TransactionMetadata;
  };

  type Nip47Notification =
    | { notification_type: 'payment_received'; notification: Nip47Transaction }
    | { notification_type: 'payment_sent'; notification: Nip47Transaction }
    | { notification_type: 'hold_invoice_accepted'; notification: Nip47Transaction };
  type Nip47NotificationType = Nip47Notification['notification_type'];

  type Nip47PayInvoiceRequest = { invoice: string; metadata?: Nip47TransactionMetadata; amount?: number };
  type Nip47MakeInvoiceRequest = {
    amount: number;
    description?: string;
    description_hash?: string;
    expiry?: number;
    metadata?: Nip47TransactionMetadata;
  };
  type Nip47LookupInvoiceRequest = { payment_hash?: string; invoice?: string };

  class NWCClient {
    relayUrl: string;
    secret: string | undefined;
    lud16: string | undefined;
    walletPubkey: string;
    options: NWCOptions;
    static parseWalletConnectUrl(walletConnectUrl: string): NWCOptions;
    constructor(options?: NewNWCClientOptions);
    get connected(): boolean;
    get publicKey(): string;
    get encryptionType(): string;
    close(): void;
    getWalletServiceInfo(): Promise<{ encryptions: string[]; capabilities: Nip47Capability[]; notifications: Nip47NotificationType[] }>;
    getInfo(): Promise<Nip47GetInfoResponse>;
    getBalance(): Promise<Nip47GetBalanceResponse>;
    payInvoice(request: Nip47PayInvoiceRequest): Promise<Nip47PayResponse>;
    makeInvoice(request: Nip47MakeInvoiceRequest): Promise<Nip47Transaction>;
    lookupInvoice(request: Nip47LookupInvoiceRequest): Promise<Nip47Transaction>;
    listTransactions(request: Nip47ListTransactionsRequest): Promise<Nip47ListTransactionsResponse>;
    subscribeNotifications(
      onNotification: (notification: Nip47Notification) => void,
      notificationTypes?: Nip47NotificationType[],
    ): Promise<() => void>;
  }
}
