fetch(`http://localhost:3000/api/posts/af840feb-8335-4196-983d-4648080319ae`, {
  method: "delete",
})
  .then((r) => console.log(r))
  .catch((err) => console.log(err));
