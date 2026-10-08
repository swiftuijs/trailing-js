#include <errno.h>
#include <linux/filter.h>
#include <linux/seccomp.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/syscall.h>
#include <unistd.h>

#ifndef SYS_pidfd_open
#if defined(__x86_64__) || defined(__aarch64__)
#define SYS_pidfd_open 434
#else
#error Unsupported test syscall architecture
#endif
#endif

/* A test fault injector, not a security sandbox. Inherit denial across exec. */
int main(int argc, char **argv) {
  if (argc < 3) return 64;
  int error = strcmp(argv[1], "enosys") == 0 ? ENOSYS
    : strcmp(argv[1], "eperm") == 0 ? EPERM
    : strcmp(argv[1], "eacces") == 0 ? EACCES
    : strcmp(argv[1], "emfile") == 0 ? EMFILE : 0;
  if (!error) return 64;
  struct sock_filter filter[] = {
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr)),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SYS_pidfd_open, 0, 1),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | error),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
  };
  struct sock_fprog program = { .len = sizeof(filter) / sizeof(filter[0]), .filter = filter };
  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) ||
      prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &program)) {
    perror("test seccomp setup");
    return 70;
  }
  if (syscall(SYS_pidfd_open, getpid(), 0) != -1 || errno != error) return 70;
  execvp(argv[2], &argv[2]);
  perror("exec test Node");
  return 127;
}
