
//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;
pragma experimental ABIEncoderV2;

contract Minimal_contract {

	string data;

	constructor(string memory _data) {
		data = _data;
	}

	function getall() public view returns (address, string memory) {
		return (address(this), data);
	}

	function get_data() public view returns (string memory) {
		return data;
	}
}

contract App {

	address[] Minimal_list;
	uint256 Minimal_list_length;

	function get_Minimal_list_length() public view returns (uint256) {
		return Minimal_list_length;
	}

	struct Minimal_getter {
		address _address;
		string data;
	}

	function get_Minimal_N(uint256 index) public view returns (address, string memory) {
		return Minimal_contract(Minimal_list[index]).getall();
	}

	function get_first_Minimal_N(uint256 count, uint256 offset) public view returns (Minimal_getter[] memory) {
		Minimal_getter[] memory getters = new Minimal_getter[](count);
		for (uint i = offset; i < count; i++) {
			Minimal_contract myMinimal = Minimal_contract(Minimal_list[i + offset]);
			getters[i - offset]._address = address(myMinimal);
			getters[i - offset].data = myMinimal.get_data();
		}
		return getters;
	}

	function get_last_Minimal_N(uint256 count, uint256 offset) public view returns (Minimal_getter[] memory) {
		Minimal_getter[] memory getters = new Minimal_getter[](count);
		for (uint i = 0; i < count; i++) {
			Minimal_contract myMinimal = Minimal_contract(Minimal_list[Minimal_list_length - i - offset - 1]);
			getters[i]._address = address(myMinimal);
			getters[i].data = myMinimal.get_data();
		}
		return getters;
	}

	function get_Minimal_user_length(address user) public view returns (uint256) {
		return user_map[user].Minimal_list_length;
	}

	function get_Minimal_user_N(address user, uint256 index) public view returns (address, string memory) {
		return Minimal_contract(user_map[user].Minimal_list[index]).getall();
	}

	function get_last_Minimal_user_N(address user, uint256 count, uint256 offset) public view returns (Minimal_getter[] memory) {
		Minimal_getter[] memory getters = new Minimal_getter[](count);
		for (uint i = offset; i < count; i++) {
			getters[i - offset]._address = user_map[user].Minimal_list[i + offset];
			getters[i - offset].data = Minimal_contract(user_map[user].Minimal_list[i + offset]).get_data();
		}
		return getters;
	}

	struct UserInfo {
		address owner;
		bool exists;
		address[] Minimal_list;
		uint256 Minimal_list_length;
	}
	mapping(address => UserInfo) public user_map;
	address[] UserInfoList;
	uint256 UserInfoListLength;

	event NewMinimal(address sender);

	function new_Minimal(string memory data) public returns (address) {
		address mynew = address(new Minimal_contract({
			_data : data
		}));

		if(!user_map[tx.origin].exists) {
			user_map[tx.origin] = create_user_on_new_Minimal(mynew);
		}
		user_map[tx.origin].Minimal_list.push(mynew);
		user_map[tx.origin].Minimal_list_length += 1;

		Minimal_list.push(mynew);
		Minimal_list_length += 1;

		emit NewMinimal(tx.origin);

		return mynew;
	}

	function create_user_on_new_Minimal(address addr) private returns (UserInfo memory) {
		address[] memory Minimal_list_ = new address[](0);
		UserInfoList.push(addr);
		return UserInfo({
			exists: true,
			owner: addr,
			Minimal_list: Minimal_list_,
			Minimal_list_length: 0
		});
	}

}

