// Independent native workload: no Node interpreter in the measured child.
#include <errno.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static int send_bytes(int fd, const unsigned char *bytes, size_t count) {
  while (count) {
    ssize_t n = write(fd, bytes, count);
    if (n < 0 && errno == EINTR) continue;
    if (n <= 0) return 1;
    bytes += n;
    count -= (size_t)n;
  }
  return 0;
}

int main(int argc, char **argv) {
  unsigned char bytes[65536], errors[65536];
  if (argc == 3 && strcmp(argv[1], "emit") == 0) {
    size_t remaining = (size_t)strtoull(argv[2], NULL, 10);
    memset(bytes, 'a', sizeof bytes);
    memset(errors, 'b', sizeof errors);
    while (remaining) {
      size_t count = remaining < sizeof bytes ? remaining : sizeof bytes;
      if (send_bytes(1, bytes, count) || send_bytes(2, errors, count)) return 1;
      remaining -= count;
    }
    return 0;
  }
  if (argc == 2 && (strcmp(argv[1], "echo") == 0 || strcmp(argv[1], "duplex") == 0)) {
    for (;;) {
      ssize_t count = read(0, bytes, sizeof bytes);
      if (count < 0 && errno == EINTR) continue;
      if (count < 0) return 1;
      if (count == 0) return 0;
      if (send_bytes(1, bytes, (size_t)count)) return 1;
      if (strcmp(argv[1], "duplex") == 0 && send_bytes(2, bytes, (size_t)count)) return 1;
    }
  }
  return 2;
}
