# UniFFI Proc-Macro Mode

UDL-free authoring with `#[uniffi::export]` macros. Faster iteration, type-checked by `rustc`. Recommended for new crates.

## Setup

```toml
# Cargo.toml
[dependencies]
uniffi = { version = "0.28", features = ["cli"] }

[build-dependencies]
uniffi = { version = "0.28", features = ["build"] }
```

```rust
// build.rs
fn main() {
    uniffi::generate_scaffolding_for_crate(/* path */, "mycrate").unwrap();
}

// or simpler — let uniffi auto-detect
```

```rust
// src/lib.rs
uniffi::setup_scaffolding!();
```

That's it — no `.udl` file required.

## Functions

```rust
#[uniffi::export]
pub fn generate_mnemonic(word_count: u32) -> Result<String, WalletError> {
    Ok("abandon abandon ...".to_string())
}

#[uniffi::export(default(salt = ""))]
pub fn derive_address(mnemonic: String, index: u32, salt: String) -> String {
    format!("addr_{index}_{salt}")
}
```

## Records

```rust
#[derive(uniffi::Record)]
pub struct Balance {
    pub confirmed: u64,
    pub trusted_pending: u64,
    pub untrusted_pending: u64,
}
```

Records are value types — marshaled by copy.

## Objects (Interfaces)

```rust
#[derive(uniffi::Object)]
pub struct Wallet {
    inner: std::sync::Mutex<InnerWallet>,
}

#[uniffi::export]
impl Wallet {
    #[uniffi::constructor]
    pub fn new(mnemonic: String) -> Result<Arc<Self>, WalletError> {
        let inner = InnerWallet::from_mnemonic(&mnemonic)?;
        Ok(Arc::new(Wallet {
            inner: std::sync::Mutex::new(inner),
        }))
    }

    pub fn get_address(&self, index: u32) -> String {
        self.inner.lock().unwrap().address(index)
    }

    pub fn get_balance(&self) -> Result<Balance, WalletError> {
        Ok(self.inner.lock().unwrap().balance())
    }
}
```

Multiple constructors: name them.

```rust
#[uniffi::export]
impl Wallet {
    #[uniffi::constructor]
    pub fn from_mnemonic(mnemonic: String) -> Result<Arc<Self>, WalletError> { /* ... */ }

    #[uniffi::constructor(name = "from_descriptor")]
    pub fn from_descriptor(desc: String) -> Result<Arc<Self>, WalletError> { /* ... */ }
}
```

## Enums

### Unit variants

```rust
#[derive(uniffi::Enum)]
pub enum Network {
    Bitcoin,
    Testnet,
    Signet,
    Regtest,
}
```

### With associated data

```rust
#[derive(uniffi::Enum)]
pub enum Output {
    Address { address: String, amount: u64 },
    Script { hex: String, amount: u64 },
    OpReturn { data: Vec<u8> },
}
```

Maps to:
- Kotlin: `sealed class Output { data class Address(...); data class Script(...); ... }`
- Swift: `enum Output { case address(...); case script(...); ... }`

## Errors

```rust
#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum WalletError {
    #[error("invalid mnemonic")]
    InvalidMnemonic,
    #[error("network: {message}")]
    Network { message: String },
    #[error("insufficient funds: need {need}, have {have}")]
    InsufficientFunds { need: u64, have: u64 },
}
```

For simpler bindings:

```rust
#[derive(Debug, thiserror::Error, uniffi::Error)]
#[uniffi(flat_error)]
pub enum WalletError {
    #[error("invalid mnemonic")]
    InvalidMnemonic,
    // ... fields collapsed to message string
}
```

## Async Functions

```rust
#[uniffi::export(async_runtime = "tokio")]
impl Wallet {
    pub async fn sync(&self) -> Result<Balance, WalletError> {
        // freely await tokio futures
        let balance = self.client.fetch_balance().await?;
        Ok(balance)
    }
}
```

```kotlin
val bal = wallet.sync()    // suspend function in Kotlin
```

```swift
let bal = try await wallet.sync()
```

Top-level async function:

```rust
#[uniffi::export(async_runtime = "tokio")]
pub async fn estimate_fees() -> Result<FeeEstimate, WalletError> {
    // ...
}
```

## Callback Interfaces

```rust
#[uniffi::export(callback_interface)]
pub trait BlockListener: Send + Sync {
    fn on_new_block(&self, height: u64, hash: String);
}

#[uniffi::export]
pub fn watch_blocks(listener: Box<dyn BlockListener>) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_secs(10));
            listener.on_new_block(800_000, "abc...".to_string());
        }
    });
}
```

## Trait Interfaces (polymorphic Rust → host)

```rust
#[uniffi::export]
pub trait Signer: Send + Sync {
    fn sign(&self, message: Vec<u8>) -> Vec<u8>;
}

#[uniffi::export]
pub fn sign_with(signer: Arc<dyn Signer>, msg: Vec<u8>) -> Vec<u8> {
    signer.sign(msg)
}
```

Host implements `Signer` and passes the impl back into Rust functions accepting `Arc<dyn Signer>`.

## Custom Types (Validation at FFI Boundary)

```rust
#[derive(uniffi::Object)]
pub struct Address(String);

#[uniffi::export]
impl Address {
    #[uniffi::constructor]
    pub fn parse(s: String) -> Result<Arc<Self>, WalletError> {
        if !s.starts_with("bc1") {
            return Err(WalletError::InvalidAddress);
        }
        Ok(Arc::new(Address(s)))
    }

    pub fn as_string(&self) -> String { self.0.clone() }
}
```

For lighter validation (no boxing), use the `Custom` type pattern:

```rust
uniffi::custom_type!(Url, String, {
    remote,
    try_lift: |val: String| {
        Url::parse(&val).map_err(|e| anyhow::anyhow!("{}", e))
    },
    lower: |val: Url| val.to_string(),
});
```

## Procedural vs UDL — Trade-offs

| Aspect | UDL | Proc-macro |
|---|---|---|
| Definition lang | Custom IDL | Inline Rust |
| Type checking | At codegen time | At compile time |
| IDE support | Limited | Full Rust IDE |
| Stability | Mature, used by BDK/LDK/CDK | Solid since 0.25, evolving |
| Mixed mode | — | Can mix UDL + proc-macro |
| Async support | Limited | Full |
| Non-trivial generics | Manual workarounds | Same limits |
| Trait objects | `[Trait]` annotation | `#[uniffi::export(callback_interface)]` |

**Recommendation**: new crates → proc-macro. Maintaining BDK/LDK/CDK forks → keep UDL.

## Mixing Modes

Both can coexist in one crate:

```rust
// build.rs
fn main() {
    uniffi::generate_scaffolding("./src/wallet.udl").unwrap();
}

// src/lib.rs
uniffi::include_scaffolding!("wallet");
uniffi::setup_scaffolding!();   // for proc-macro side
```

Useful for incremental migration from UDL to proc-macro.

## Testing FFI from Rust

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wallet_constructor_validates_mnemonic() {
        assert!(Wallet::new("not enough words".into()).is_err());
        let valid = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        assert!(Wallet::new(valid.into()).is_ok());
    }
}
```

UniFFI types behave like normal Rust types — test as usual. For end-to-end host binding tests, use a small Kotlin/Swift harness or `uniffi::testing` helpers.

## Common Pitfalls

| Pitfall | Fix |
|---|---|
| `pub` items not exposed | Add `#[uniffi::export]` explicitly |
| Async without `async_runtime` | Add `(async_runtime = "tokio")` |
| Returning `&str` | UniFFI requires owned `String` |
| Returning `&[u8]` | Use `Vec<u8>` |
| Method signature mismatch | UDL ↔ Rust must match exactly when mixing |
| Constructor not as `Arc<Self>` | All object constructors must return `Arc<Self>` |
| `Send + Sync` missing on traits | Add bounds — required for FFI |
