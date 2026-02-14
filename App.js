import CategoryProvider from "./context/CategoryContext"; // ✅ FIXED
import AppNavigator from "./navigation/AppNavigator";

export default function App() {
  return (
    <CategoryProvider>
      <AppNavigator />
    </CategoryProvider>
  );
}
