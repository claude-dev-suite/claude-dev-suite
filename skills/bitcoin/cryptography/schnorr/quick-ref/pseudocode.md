# BIP340 Schnorr signing/verifying pseudocode

Direct from BIP340 reference, with line-numbered comments to make
auditing simple.

## Constants

```python
P_FIELD  = 2**256 - 2**32 - 977
N_ORDER  = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
G_BASE   = (
    0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798,
    0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8,
)
```

## Tagged hash

```python
def tagged_hash(tag: str, msg: bytes) -> bytes:
    th = hashlib.sha256(tag.encode()).digest()
    return hashlib.sha256(th + th + msg).digest()
```

## Lift x

```python
def lift_x(x: int):
    if x >= P_FIELD: return None
    y2 = (x*x*x + 7) % P_FIELD
    y  = pow(y2, (P_FIELD + 1) // 4, P_FIELD)
    if (y * y) % P_FIELD != y2: return None
    return (x, y if y % 2 == 0 else P_FIELD - y)   # even-y convention
```

## Sign

```python
def schnorr_sign(secret: bytes, message: bytes, aux: bytes) -> bytes:
    d0 = int.from_bytes(secret, 'big')
    if not (1 <= d0 < N_ORDER): raise ValueError
    P = point_mul(G_BASE, d0)
    d = d0 if P[1] % 2 == 0 else N_ORDER - d0     # force even-y for P

    t = (d ^ int.from_bytes(tagged_hash("BIP0340/aux", aux), 'big')) \
        .to_bytes(32, 'big')

    k0 = int.from_bytes(
        tagged_hash("BIP0340/nonce", t + P[0].to_bytes(32, 'big') + message),
        'big'
    ) % N_ORDER
    if k0 == 0: raise ValueError("nonce zero")

    R = point_mul(G_BASE, k0)
    k = k0 if R[1] % 2 == 0 else N_ORDER - k0     # force even-y for R

    e = int.from_bytes(
        tagged_hash("BIP0340/challenge",
                    R[0].to_bytes(32, 'big') + P[0].to_bytes(32, 'big') + message),
        'big'
    ) % N_ORDER

    s = (k + e * d) % N_ORDER
    return R[0].to_bytes(32, 'big') + s.to_bytes(32, 'big')
```

## Verify

```python
def schnorr_verify(pubkey: bytes, message: bytes, sig: bytes) -> bool:
    if len(pubkey) != 32 or len(sig) != 64 or len(message) == 0:
        return False
    P = lift_x(int.from_bytes(pubkey, 'big'))
    if P is None: return False
    r = int.from_bytes(sig[:32], 'big')
    s = int.from_bytes(sig[32:], 'big')
    if r >= P_FIELD or s >= N_ORDER: return False
    e = int.from_bytes(
        tagged_hash("BIP0340/challenge",
                    sig[:32] + pubkey + message),
        'big'
    ) % N_ORDER
    R = point_add(point_mul(G_BASE, s),
                  point_neg(point_mul(P, e)))
    if R is None or R[1] % 2 != 0 or R[0] != r: return False
    return True
```

`point_mul` / `point_add` / `point_neg` are standard secp256k1 ops
(use libsecp256k1 in production — these snippets are only for
illustration).

## Test vectors

BIP340 ships **test vectors** with known good `(d, m, aux, sig)`
tuples covering edge cases (zero aux, max-value scalars, even/odd
points). Always run before deploying.

Path: `bitcoin/bips/bip-0340/test-vectors.csv`.
