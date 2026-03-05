---
name: grpc
description: |
  gRPC service development. Protocol Buffers (protobuf), service definitions,
  streaming (unary, server, client, bidirectional), interceptors, and
  code generation for Node.js, Go, Java, and Python.

  USE WHEN: user mentions "gRPC", "protobuf", "Protocol Buffers", ".proto",
  "grpc-js", "tonic", "grpc-java", "service mesh RPC"

  DO NOT USE FOR: REST APIs - use `rest-api`;
  GraphQL - use `graphql`; WebSocket - use real-time skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# gRPC

## Proto Definition

```protobuf
// proto/product.proto
syntax = "proto3";
package product;

service ProductService {
  rpc GetProduct(GetProductRequest) returns (Product);
  rpc ListProducts(ListProductsRequest) returns (stream Product);     // Server streaming
  rpc UploadProducts(stream Product) returns (UploadResponse);        // Client streaming
  rpc SyncProducts(stream SyncRequest) returns (stream SyncResponse); // Bidirectional
}

message Product {
  string id = 1;
  string name = 2;
  double price = 3;
  repeated string tags = 4;
  google.protobuf.Timestamp created_at = 5;
}

message GetProductRequest { string id = 1; }
message ListProductsRequest {
  int32 page_size = 1;
  string page_token = 2;
}
message UploadResponse { int32 count = 1; }
```

## Node.js (@grpc/grpc-js)

```typescript
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const packageDef = protoLoader.loadSync('proto/product.proto');
const proto = grpc.loadPackageDefinition(packageDef).product as any;

// Server
const server = new grpc.Server();
server.addService(proto.ProductService.service, {
  getProduct: (call: any, callback: any) => {
    const product = db.findProduct(call.request.id);
    callback(null, product);
  },
  listProducts: (call: any) => {
    const products = db.listProducts(call.request);
    for (const p of products) call.write(p);
    call.end();
  },
});

server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => {
  console.log('gRPC server running on port 50051');
});

// Client
const client = new proto.ProductService('localhost:50051', grpc.credentials.createInsecure());
client.getProduct({ id: '123' }, (err: any, product: any) => {
  console.log(product);
});
```

## Go (google.golang.org/grpc)

```go
// Server implementation
type productServer struct {
    pb.UnimplementedProductServiceServer
}

func (s *productServer) GetProduct(ctx context.Context, req *pb.GetProductRequest) (*pb.Product, error) {
    product, err := s.db.FindProduct(req.Id)
    if err != nil {
        return nil, status.Errorf(codes.NotFound, "product not found: %s", req.Id)
    }
    return product, nil
}

func main() {
    lis, _ := net.Listen("tcp", ":50051")
    s := grpc.NewServer(
        grpc.UnaryInterceptor(loggingInterceptor),
    )
    pb.RegisterProductServiceServer(s, &productServer{})
    s.Serve(lis)
}
```

## Error Handling

```typescript
// Use standard gRPC status codes
import { status } from '@grpc/grpc-js';

callback({
  code: status.NOT_FOUND,
  message: `Product ${id} not found`,
});

callback({
  code: status.INVALID_ARGUMENT,
  message: 'Product name is required',
});
```

| Code | Use When |
|------|----------|
| `NOT_FOUND` | Resource doesn't exist |
| `INVALID_ARGUMENT` | Bad request data |
| `PERMISSION_DENIED` | Insufficient permissions |
| `UNAUTHENTICATED` | Missing/invalid credentials |
| `UNAVAILABLE` | Service temporarily down (retryable) |

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Returning HTTP status codes | Use gRPC status codes |
| No deadline/timeout on calls | Always set `deadline` on client calls |
| Large messages (>4MB default) | Stream large data, or increase `maxReceiveMessageLength` |
| No interceptors for auth/logging | Use unary/stream interceptors |
| Proto files not versioned | Keep .proto in source control, use package versioning |

## Production Checklist

- [ ] TLS certificates configured
- [ ] Health check service (gRPC health checking protocol)
- [ ] Interceptors for auth, logging, metrics
- [ ] Deadlines set on all client calls
- [ ] Proto file versioning strategy
- [ ] Load balancing configured (client-side or L7)
