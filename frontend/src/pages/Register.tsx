import { FormEvent, useState } from "react";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuthStore } from "@/store/authStore";

const RegisterPage = () => {
  const navigate = useNavigate();
  const register = useAuthStore((state) => state.register);
  const loading = useAuthStore((state) => state.loading);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    try {
      await register(username, password);
      toast.success("Account created");
      navigate("/dashboard");
    } catch (error) {
      toast.error("Unable to register with this username");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md border-[#2a2a4a] bg-[#161625] p-8 shadow-soft">
        <h1 className="text-2xl font-semibold text-white">Create your DockPilot account</h1>
        <p className="mt-2 text-sm text-[#a0a0c0]">Start managing and securing your container platform.</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="mb-1 block text-sm text-[#a0a0c0]">Username</label>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              minLength={3}
              maxLength={20}
              required
              className="w-full rounded-lg border border-[#2a2a4a] bg-[#0f0f1a] px-3 py-2 text-white outline-none transition-colors focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-[#a0a0c0]">Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
              className="w-full rounded-lg border border-[#2a2a4a] bg-[#0f0f1a] px-3 py-2 text-white outline-none transition-colors focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-[#a0a0c0]">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              className="w-full rounded-lg border border-[#2a2a4a] bg-[#0f0f1a] px-3 py-2 text-white outline-none transition-colors focus:border-indigo-500"
            />
          </div>

          <Button type="submit" loading={loading} className="w-full">
            Create Account
          </Button>
        </form>

        <p className="mt-4 text-sm text-[#a0a0c0]">
          Already registered?{" "}
          <Link to="/login" className="text-indigo-300 hover:text-indigo-200">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
};

export default RegisterPage;
