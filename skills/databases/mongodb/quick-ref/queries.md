# MongoDB Queries Quick Reference

> **Knowledge Base:** Read `knowledge/mongodb/queries.md` for complete documentation.

## Basic CRUD

```javascript
// Create
db.users.insertOne({ name: "John", age: 30 });
db.users.insertMany([{ name: "Jane" }, { name: "Bob" }]);

// Read
db.users.find({ age: { $gte: 18 } });
db.users.findOne({ _id: ObjectId("...") });

// Update
db.users.updateOne({ _id: id }, { $set: { age: 31 } });
db.users.updateMany({ status: "active" }, { $inc: { visits: 1 } });

// Delete
db.users.deleteOne({ _id: id });
db.users.deleteMany({ status: "inactive" });
```

## Query Operators

```javascript
// Comparison
{ age: { $eq: 25 } }    // Equal
{ age: { $ne: 25 } }    // Not equal
{ age: { $gt: 25 } }    // Greater than
{ age: { $gte: 25 } }   // Greater or equal
{ age: { $lt: 25 } }    // Less than
{ age: { $lte: 25 } }   // Less or equal
{ age: { $in: [20, 25, 30] } }  // In array
{ age: { $nin: [20, 25] } }    // Not in array

// Logical
{ $and: [{ age: { $gte: 18 } }, { status: "active" }] }
{ $or: [{ age: { $lt: 18 } }, { status: "vip" }] }
{ $not: { age: { $lt: 18 } } }

// Element
{ email: { $exists: true } }
{ age: { $type: "int" } }
```

## Array Operations

```javascript
// Query arrays
{ tags: "mongodb" }                    // Contains element
{ tags: { $all: ["db", "nosql"] } }    // Contains all
{ tags: { $size: 3 } }                 // Exact size
{ "tags.0": "first" }                  // Index position

// Array update operators
{ $push: { tags: "new" } }             // Add element
{ $addToSet: { tags: "unique" } }      // Add if not exists
{ $pull: { tags: "remove" } }          // Remove element
{ $pop: { tags: 1 } }                  // Remove last
```

## Projections & Sorting

```javascript
// Projection (select fields)
db.users.find({}, { name: 1, email: 1, _id: 0 });

// Sorting
db.users.find().sort({ createdAt: -1 });  // Descending
db.users.find().sort({ name: 1 });        // Ascending

// Pagination
db.users.find().skip(20).limit(10);

// Count
db.users.countDocuments({ status: "active" });
```

## Aggregation Pipeline

```javascript
db.orders.aggregate([
  { $match: { status: "completed" } },
  { $group: {
    _id: "$customerId",
    total: { $sum: "$amount" },
    count: { $sum: 1 }
  }},
  { $sort: { total: -1 } },
  { $limit: 10 }
]);

// Lookup (join)
db.orders.aggregate([
  { $lookup: {
    from: "users",
    localField: "userId",
    foreignField: "_id",
    as: "user"
  }},
  { $unwind: "$user" }
]);
```

**Official docs:** https://www.mongodb.com/docs/manual/crud/
